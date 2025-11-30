import * as OrderRepository from "./order.repository";
import {
  CreateOrderDTO,
  Order,
  OrderListQueryDTO,
  PaginatedOrderList,
} from "./order.types.js";

const MOCK_MERCHANT_ID = "10001";

// ----------------------------------------------------------------------
// P2.1 Service: 创建订单（核心业务流程）
// ----------------------------------------------------------------------

/**
 * 核心业务：创建订单，包含配送范围校验。
 * @param data 订单创建数据
 * @returns 创建成功的订单实体
 */
export async function createNewOrder(data: CreateOrderDTO): Promise<Order> {
  const { recipientCoords } = data;

  // 1. 核心校验：检查收货地址是否在配送范围内
  const checkResult = await OrderRepository.checkDeliveryRange(recipientCoords);

  if (!checkResult.isDeliverable) {
    // 抛出业务错误，Controller 层负责将其转换为 400 Bad Request
    throw new Error("Recipient address is outside of the delivery range.");
  }

  // 2. 校验成功，获取 ruleId 并创建订单
  const ruleId = checkResult.ruleId as number;
  const newOrder = await OrderRepository.createOrder(data, ruleId);

  return newOrder;
}

// ----------------------------------------------------------------------
// P2.2 Service: 查询订单详情
// ----------------------------------------------------------------------

/**
 * 根据 ID 查询订单详情。
 * @param orderId 订单 ID
 * @param merchantId 商家 ID (用于权限过滤)
 * @returns 订单实体
 */
export async function getOrderDetails(
  orderId: string,
  merchantId: string
): Promise<Order> {
  const order = await OrderRepository.findOrderById(orderId, merchantId);

  if (!order) {
    // 抛出业务错误，Controller 层负责将其转换为 404 Not Found
    throw new Error(`Order ID ${orderId} not found.`);
  }
  return order;
}

/**
 * 根据复杂的筛选条件获取分页订单列表。
 */
export async function findOrdersList(
  queryParams: OrderListQueryDTO
): Promise<PaginatedOrderList> {
  // 确保分页参数有合理的默认值
  const defaults: OrderListQueryDTO = { page: 1, pageSize: 20 };
  const finalParams = { ...defaults, ...queryParams };

  // 调用 Repository，传入 merchantId (MOCK_MERCHANT_ID)
  return await OrderRepository.findOrdersByFilter(
    finalParams,
    MOCK_MERCHANT_ID
  );
}
