import { query } from "../../config/db.js";
import { Coordinates } from "../../shared/geo.types.js";
import {
  DeliveryCheckResult,
  CreateOrderDTO,
  Order,
  OrderStatus,
  OrderListQueryDTO,
  PaginatedOrderList,
  OrderRow,
  CountRow,
} from "./order.types.js";
import { coordsToPointWKT } from "../../utils/geo.utils.js";

const MOCK_MERCHANT_ID = "10001";
const SRID = 4326;

// 排序字段的白名单映射：TS 字段名 -> 数据库列名
const SORT_COLUMN_MAP: Record<string, string> = {
  createTime: "create_time", // 默认排序字段
  amount: "amount",
  status: "status",
  recipientName: "recipient_name",
};

// ----------------------------------------------------------------------
// P2.1 核心：配送范围校验
// ----------------------------------------------------------------------

/**
 * 检查给定坐标是否在任何一个配送围栏内。
 * @param coords 收货地址坐标 [lng, lat]
 * @returns DeliveryCheckResult
 */
export async function checkDeliveryRange(
  coords: Coordinates
): Promise<DeliveryCheckResult> {
  // 生成收货点 Point 的 WKT 表达式
  const recipientPointWKT = coordsToPointWKT(coords);

  const sql = `
        SELECT 
            f.rule_id,
            f.radius
        FROM fences f
        WHERE f.merchant_id = $2
        AND (
            -- Case 1: 多边形围栏 (shape_type = 'polygon')
            -- 将 ST_Contains 替换为 ST_Covers，该函数支持 GEOGRAPHY 类型
            (f.shape_type = 'polygon' AND ST_Covers(f.geometry, ST_GeomFromText($1, ${SRID})::geography)) 
            
            OR
            
            -- Case 2: 圆形围栏 (shape_type = 'circle') - 保持不变
            (f.shape_type = 'circle' AND ST_DWithin(
                f.geometry, 
                ST_GeomFromText($1, ${SRID})::geography, 
                f.radius
            ))
        )
        LIMIT 1;
    `;

  // 使用 recipientPointWKT 作为 $1 参数 (WKT字符串)，MOCK_MERCHANT_ID 作为 $2
  const rows: OrderRow[] = await query(sql, [
    recipientPointWKT,
    MOCK_MERCHANT_ID,
  ]);

  if (rows.length > 0) {
    return {
      isDeliverable: true,
      ruleId: rows[0].rule_id, // 返回匹配到的规则ID
    };
  }

  return {
    isDeliverable: false,
    ruleId: null,
  };
}

// ----------------------------------------------------------------------
// 辅助函数：将数据库行转换为 Order 模型
// ----------------------------------------------------------------------

function mapRowToOrder(row: OrderRow): Order {
  // 解析 GEOGRAPHY 坐标，PostGIS 返回 GeoJSON 字符串
  const recipientCoordsGeoJSON = row.recipient_coords_geojson
    ? JSON.parse(row.recipient_coords_geojson)
    : null;
  const currentPositionGeoJSON = row.current_position_geojson
    ? JSON.parse(row.current_position_geojson)
    : null;

  const recipientCoords: Coordinates = recipientCoordsGeoJSON?.coordinates || [
    0, 0,
  ];
  const currentPosition: Coordinates | undefined =
    currentPositionGeoJSON?.coordinates;

  return {
    id: row.id,
    userId: row.user_id,
    merchantId: row.merchant_id,
    createTime: row.create_time.toISOString(), // 转换为 ISO 字符串
    amount: parseFloat(row.amount as string), // 确保是数字
    status: row.status as OrderStatus,
    recipientName: row.recipient_name,
    recipientAddress: row.recipient_address,
    recipientCoords: recipientCoords,
    lastUpdateTime: row.last_update_time
      ? row.last_update_time.toISOString()
      : undefined,
    currentPosition: currentPosition,
    routePath: row.route_path,
    isAbnormal: row.is_abnormal,
    ruleId: row.rule_id,
  } as Order;
}

// ----------------------------------------------------------------------
// P2.1 订单创建
// ----------------------------------------------------------------------

export async function createOrder(
  data: CreateOrderDTO,
  ruleId: number
): Promise<Order> {
  const {
    userId,
    amount,
    recipientName,
    recipientAddress,
    recipientCoords,
    merchantId,
  } = data;

  // 1. 生成收货点 Point 的 WKT 表达式
  const recipientPointWKT = coordsToPointWKT(recipientCoords);

  // 2. 插入订单数据
  const sql = `
        INSERT INTO orders (
            id, user_id, merchant_id, amount, status, rule_id, recipient_name, recipient_address, recipient_coords
        ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, ST_GeomFromText($8, ${SRID})::geography
        )
        RETURNING
            *, 
            -- 转换为 GeoJSON，便于 TS 解析坐标
            ST_AsGeoJSON(recipient_coords) AS recipient_coords_geojson,
            ST_AsGeoJSON(current_position) AS current_position_geojson;
    `;

  const params = [
    userId, // $1
    merchantId, // $2
    amount, // $3
    OrderStatus.Pending, // $4
    ruleId, // $5
    recipientName, // $6
    recipientAddress, // $7
    recipientPointWKT, // $8
  ];

  const rows: OrderRow[] = await query(sql, params);

  if (rows.length === 0) {
    throw new Error("Order creation failed.");
  }

  // 3. 映射并返回 Order
  return mapRowToOrder(rows[0]);
}

// ----------------------------------------------------------------------
// P2.2 订单查询
// ----------------------------------------------------------------------

export async function findOrderById(
  orderId: string,
  merchantId: string
): Promise<Order | null> {
  const sql = `
        SELECT 
            *,
            ST_AsGeoJSON(recipient_coords) AS recipient_coords_geojson,
            ST_AsGeoJSON(current_position) AS current_position_geojson
        FROM orders
        WHERE id = $1 AND merchant_id = $2;
    `;

  const rows: OrderRow[] = await query(sql, [orderId, merchantId]);

  if (rows.length === 0) {
    return null;
  }

  return mapRowToOrder(rows[0]);
}

/**
 * 根据复杂的筛选条件获取分页订单列表。
 * @param queryParams 包含分页、筛选和搜索关键词
 * @returns PaginatedOrderList
 */
export async function findOrdersByFilter(
  queryParams: OrderListQueryDTO,
  merchantId: string
): Promise<PaginatedOrderList> {
  const {
    page,
    pageSize,
    userId,
    status,
    searchQuery,
    sortBy = "createTime", // 默认按创建时间
    sortDirection = "DESC", // 默认倒序
  } = queryParams;

  // 1. 初始化基础 SQL 和参数
  const whereClauses: string[] = ["merchant_id = $1"]; // 商家 ID 总是第一个参数
  const params: (string | number)[] = [merchantId];
  let paramIndex = 2; // 后续参数从 $2 开始

  // 2. 构建动态 WHERE 条件

  // 2A. 用户 ID 筛选
  if (userId) {
    whereClauses.push(`user_id = $${paramIndex++}`);
    params.push(userId);
  }

  // 2B. 状态筛选
  if (status) {
    whereClauses.push(`status = $${paramIndex++}`);
    params.push(status);
  }

  // 2C. 搜索 (模糊匹配姓名或地址)
  if (searchQuery) {
    // 使用 ILIKE (不区分大小写的 LIKE)
    whereClauses.push(
      `(recipient_name ILIKE $${paramIndex} OR recipient_address ILIKE $${paramIndex})`
    );
    params.push(`%${searchQuery}%`); // 模糊搜索需要百分号
    paramIndex++;
  }

  // 3. 构建完整的 WHERE 子句
  const whereCondition =
    whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";

  // 4. 执行总数查询 (用于分页元数据)
  const countSql = `SELECT COUNT(*) FROM orders ${whereCondition};`;
  const countRows: CountRow[] = await query(countSql, params);
  const totalCount = parseInt(countRows[0].count, 10);

  const dbSortColumn = SORT_COLUMN_MAP[sortBy];
  if (!dbSortColumn) {
    // 如果传入了不允许排序的字段，抛出错误
    throw new Error(`Invalid sort column: ${sortBy}`);
  }

  // 4B. 方向校验
  const finalSortDirection =
    sortDirection.toUpperCase() === "ASC" ? "ASC" : "DESC";

  // 5. 执行数据查询 (添加 ORDER BY)
  const offset = (page - 1) * pageSize;

  const dataSql = `
        SELECT 
            *,
            ST_AsGeoJSON(recipient_coords) AS recipient_coords_geojson,
            ST_AsGeoJSON(current_position) AS current_position_geojson
        FROM orders
        ${whereCondition}
        ORDER BY ${dbSortColumn} ${finalSortDirection}  -- <<<< 排序逻辑
        LIMIT $${paramIndex++} 
        OFFSET $${paramIndex++};
    `;

  params.push(pageSize);
  params.push(offset);

  const dataRows = await query(dataSql, params);
  const orders = dataRows.map(mapRowToOrder); // 使用已有的映射函数

  // 6. 返回分页结果
  return {
    orders: orders,
    totalCount: totalCount,
    currentPage: page,
    pageSize: pageSize,
  };
}
