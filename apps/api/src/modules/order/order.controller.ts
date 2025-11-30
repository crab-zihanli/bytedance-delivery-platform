// src/modules/order/order.controller.ts

import { FastifyInstance } from "fastify";
import * as OrderService from "./order.service.js";
import * as OrderRepository from "./order.repository";
import { CreateOrderSchema } from "./order.schema";
import { CreateOrderDTO, OrderListQueryDTO } from "./order.types.js";
import { Coordinates } from "../../shared/geo.types.js";

// ⚠️ 模拟商家 ID (待加入认证系统后移除)
const MOCK_MERCHANT_ID = "10001";

export async function orderController(fastify: FastifyInstance) {
  // P2.1: POST /api/v1/orders - 创建订单 (核心逻辑)
  fastify.post("/", async (request, reply) => {
    // 1. Zod 校验
    const validationResult = CreateOrderSchema.safeParse(request.body);

    if (!validationResult.success) {
      return reply.code(400).send({
        error: "Invalid Input",
        details: validationResult.error.format(),
      });
    }

    // 增加 merchantId 字段，完成 DTO
    const data: CreateOrderDTO = {
      ...validationResult.data,
      merchantId: MOCK_MERCHANT_ID, // 模拟设置 merchantId
    };

    try {
      // 2. 调用 Service 层，执行“校验 + 创建”流程
      const newOrder = await OrderService.createNewOrder(data);

      // 3. 返回响应
      return reply.code(201).send({
        success: true,
        order: newOrder,
      });
    } catch (error) {
      console.error(error);
      // 捕获 Service 层抛出的业务错误
      if ((error as Error).message.includes("delivery range")) {
        return reply.code(400).send({ error: (error as Error).message });
      }
      reply.code(500).send({ error: (error as Error).message });
    }
  });

  // P2.2: GET /api/v1/orders/:id - 查询订单详情
  fastify.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      // 调用 Service 层查询
      const order = await OrderService.getOrderDetails(id, MOCK_MERCHANT_ID);

      return { success: true, order: order };
    } catch (error) {
      // 捕获 Service 抛出的 "not found" 错误
      if ((error as Error).message.includes("not found")) {
        return reply.code(404).send({ error: (error as Error).message });
      }
      console.error(error);
      reply.code(500).send({ error: "Failed to retrieve order details." });
    }
  });

  // P2.3: GET /api/v1/orders/check-delivery - 独立配送范围查询 (保持不变，直接调用 Repository)
  fastify.get("/check-delivery", async (request, reply) => {
    const { lng, lat } = request.query as { lng: string; lat: string };
    const coords: Coordinates = [parseFloat(lng), parseFloat(lat)];

    if (isNaN(coords[0]) || isNaN(coords[1])) {
      return reply.code(400).send({ error: "Invalid coordinates provided." });
    }

    try {
      const checkResult = await OrderRepository.checkDeliveryRange(coords);

      return {
        isDeliverable: checkResult.isDeliverable,
        ruleId: checkResult.ruleId,
        message: checkResult.isDeliverable
          ? "Address is within delivery range."
          : "Address is outside delivery range.",
      };
    } catch (error) {
      console.error(error);
      reply.code(500).send({ error: "Failed to perform delivery check." });
    }
  });

  // P2.4: GET /api/v1/orders - 获取订单列表 (支持分页/筛选/搜索)
  fastify.get("/", async (request, reply) => {
    // 1. 从 Query String 中解析参数，并处理类型转换
    const queryParams = request.query as {
      page?: string;
      pageSize?: string;
      userId?: string;
      status?: string;
      searchQuery?: string;
      // 排序
      sortBy?: "createTime" | "amount" | "status" | "recipientName";
      sortDirection?: "ASC" | "DESC";
    };

    const finalQueryParams: OrderListQueryDTO = {
      page: parseInt(queryParams.page || "1", 10),
      pageSize: parseInt(queryParams.pageSize || "20", 10),
      userId: queryParams.userId,
      status: queryParams.status,
      searchQuery: queryParams.searchQuery,
      // 排序参数
      sortBy: queryParams.sortBy,
      sortDirection: queryParams.sortDirection,
    };

    // 2. 校验分页参数的有效性 (简单检查)
    if (
      finalQueryParams.page < 1 ||
      finalQueryParams.pageSize < 1 ||
      finalQueryParams.pageSize > 100
    ) {
      return reply.code(400).send({ error: "Invalid pagination parameters." });
    }

    try {
      const result = await OrderService.findOrdersList(finalQueryParams);

      return { success: true, ...result };
    } catch (error) {
      console.error(error);
      // 捕获 Repository 中抛出的无效排序字段错误
      if ((error as Error).message.includes("Invalid sort column")) {
        return reply.code(400).send({ error: (error as Error).message });
      }
      reply.code(500).send({ error: "Failed to fetch paginated order list." });
    }
  });
}
