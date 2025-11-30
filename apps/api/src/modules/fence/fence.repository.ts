import { query } from "../../config/db.js";
import { createGeographyExpression } from "../../utils/geo.utils.js";
import { FenceData, CreateFenceDTO, FenceRow } from "./fence.types.js";

// ----------------------------------------------------------------------
// 辅助函数：将数据库行转换为 TS 模型
// ----------------------------------------------------------------------

/**
 * 将数据库的原始行数据（包括 PostGIS 几何字段）转换为 FenceData 模型。
 * 假设数据库查询使用了 ST_AsGeoJSON(geometry) AS geojson_data
 */
function mapRowToFenceData(row: FenceRow): FenceData {
  // 假设 PostGIS 查询结果已将 coordinates 作为一个 GeoJSON 字符串返回
  // 真实的坐标还原逻辑在 Service 层会更复杂，这里先以简单字段为主
  const geometryObj = row.geojson_data ? JSON.parse(row.geojson_data) : null;

  // 简化处理：将 coordinates 字段从 JSONB 转换回 number[][]
  let coordinates: number[][] = [];
  if (geometryObj && geometryObj.coordinates) {
    if (row.shape_type === "polygon") {
      // 对于多边形，GeoJSON 格式是 [[[...]]]，我们只取第一层
      coordinates = geometryObj.coordinates[0];
    } else if (row.shape_type === "circle") {
      // 对于点，GeoJSON 格式是 [...]，我们用一个数组包裹
      coordinates = [geometryObj.coordinates];
    }
  }

  return {
    id: row.id,
    fenceName: row.fence_name,
    fenceDesc: row.fence_desc,
    ruleId: row.rule_id,
    shapeType: row.shape_type,
    radius: parseFloat(row.radius as string), // 确保是 number 类型
    coordinates: coordinates, // 已经通过 geojson 转换得到
    // geometry: geometryObj // 仅用于内部调试
  } as FenceData;
}

// ----------------------------------------------------------------------
// CRUD: CREATE
// ----------------------------------------------------------------------

export async function createFence(
  data: CreateFenceDTO,
  merchantId: string
): Promise<FenceData> {
  const { fenceName, fenceDesc, ruleId, shapeType, coordinates, radius } = data;

  // 核心：将 TS 坐标转换为 PostGIS GEOGRAPHY 表达式
  const geographyExpression = createGeographyExpression(shapeType, coordinates);

  const sql = `
        INSERT INTO fences (
            merchant_id, fence_name, fence_desc, rule_id, shape_type, radius, coordinates_json, geometry
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, ${geographyExpression}
        )
        RETURNING 
            id, fence_name, fence_desc, rule_id, shape_type, radius, coordinates_json, 
            ST_AsGeoJSON(geometry) AS geojson_data;
    `;

  const params = [
    merchantId,
    fenceName,
    fenceDesc,
    ruleId,
    shapeType,
    radius,
    JSON.stringify(coordinates), // 原始坐标存为 JSONB
  ];

  // 🔥🔥🔥 添加这两行来调试 🔥🔥🔥
  console.log("--- DEBUG SQL ---");
  console.log("SQL:", sql);
  console.log("Params:", params);
  console.log("-----------------");

  const rows: FenceRow[] = await query(sql, params);
  if (rows.length === 0) {
    throw new Error("Fence creation failed.");
  }

  return mapRowToFenceData(rows[0]);
}

// ----------------------------------------------------------------------
// CRUD: READ (获取所有围栏)
// ----------------------------------------------------------------------

export async function findAllFences(merchantId: string): Promise<FenceData[]> {
  const sql = `
        SELECT 
            f.id, f.fence_name, f.fence_desc, f.rule_id, f.shape_type, f.radius, f.coordinates_json,
            -- 使用 PostGIS 函数将 GEOGRAPHY 字段转换为 GeoJSON 格式，便于 TS 处理
            ST_AsGeoJSON(f.geometry) AS geojson_data
        FROM fences f
        WHERE f.merchant_id = $1
        ORDER BY f.id;
    `;

  const rows = await query(sql, [merchantId]);
  return rows.map(mapRowToFenceData);
}

// ----------------------------------------------------------------------
// CRUD: DELETE
// ----------------------------------------------------------------------

export async function deleteFence(
  fenceId: number,
  merchantId: string
): Promise<boolean> {
  const sql = `
        DELETE FROM fences
        WHERE id = $1 AND merchant_id = $2;
    `;

  await query(sql, [fenceId, merchantId]);
  return true; // 实际应检查 rows 数量
}

// ----------------------------------------------------------------------
// CRUD: READ (根据 ID 获取单个围栏)
// ----------------------------------------------------------------------

export async function findFenceById(
  fenceId: number,
  merchantId: string
): Promise<FenceData | null> {
  const sql = `
        SELECT 
            f.id, f.fence_name, f.fence_desc, f.rule_id, f.shape_type, f.radius, f.coordinates_json,
            ST_AsGeoJSON(f.geometry) AS geojson_data
        FROM fences f
        WHERE f.id = $1 AND f.merchant_id = $2;
    `;

  const rows: FenceRow[] = await query(sql, [fenceId, merchantId]);

  if (rows.length === 0) {
    return null;
  }

  return mapRowToFenceData(rows[0]);
}

// ----------------------------------------------------------------------
// CRUD: UPDATE
// ----------------------------------------------------------------------

export async function updateFence(
  fenceId: number,
  data: CreateFenceDTO,
  merchantId: string
): Promise<FenceData | null> {
  const { fenceName, fenceDesc, ruleId, shapeType, coordinates, radius } = data;

  // 核心：将 TS 坐标转换为 PostGIS GEOGRAPHY 表达式
  const geographyExpression = createGeographyExpression(shapeType, coordinates);

  const sql = `
        UPDATE fences SET
            fence_name = $1,
            fence_desc = $2,
            rule_id = $3,
            shape_type = $4,
            radius = $5,
            coordinates_json = $6,
            geometry = ${geographyExpression}, -- 使用前面生成的 PostGIS 几何表达式
            updated_at = CURRENT_TIMESTAMP
        WHERE 
            id = $7 AND merchant_id = $8
        RETURNING 
            id, fence_name, fence_desc, rule_id, shape_type, radius, coordinates_json, 
            ST_AsGeoJSON(geometry) AS geojson_data;
    `;

  const params = [
    fenceName,
    fenceDesc,
    ruleId,
    shapeType,
    radius,
    JSON.stringify(coordinates), // 原始坐标存为 JSONB
    fenceId,
    merchantId,
  ];

  const rows: FenceRow[] = await query(sql, params);

  if (rows.length === 0) {
    // 如果没有行被更新，说明 ID 或 merchantId 不匹配
    return null;
  }

  return mapRowToFenceData(rows[0]);
}
