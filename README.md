# My Turborepo Monorepo

这是一个基于 Turborepo 的 monorepo 项目，包含后端 API 和三个前端应用。

## 项目结构

```
my-turborepo/
├── apps/
│   ├── api/          # 后端 API (Fastify + PostgreSQL)
│   ├── user/         # 用户端 (User)
│   ├── merchant/     # 商家端 (Merchant)
│   └── dashboard/    # 数据看板 (Dashboard)
├── packages/
│   ├── ui/           # 共享 UI 组件
│   ├── eslint-config/    # ESLint 配置
│   └── typescript-config/ # TypeScript 配置
└── turbo.json        # Turborepo 配置
```

## 技术栈

- **Monorepo**: Turborepo
- **包管理**: pnpm
- **后端**: Fastify + PostgreSQL + TypeScript
- **前端**: React + Vite + TypeScript
- **代码质量**: ESLint + Prettier + Husky + Commitlint
- **容器化**: Docker + Docker Compose
- **CI/CD**: GitHub Actions

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 开发环境

启动所有应用（需要先启动 PostgreSQL）：

```bash
# 启动 PostgreSQL (使用 Docker Compose)
docker-compose -f docker-compose.dev.yml up -d

# 启动所有应用
pnpm dev
```

各个应用会在以下端口运行：

- API: http://localhost:3000
- 用户端: http://localhost:5173
- 商家端: http://localhost:3001
- 数据看板: http://localhost:3002

### 构建

```bash
pnpm build
```

### 代码检查

```bash
# Lint
pnpm lint

# 格式化
pnpm format

# 检查格式化
pnpm format:check
```

## Docker

### 开发环境

仅启动 PostgreSQL：

```bash
docker-compose -f docker-compose.dev.yml up -d
```

### 生产环境

构建并启动所有服务：

```bash
docker-compose up -d
```

服务端口：

- API: http://localhost:3000
- 用户端: http://localhost:3003
- 商家端: http://localhost:3004
- 数据看板: http://localhost:3005

## Git Hooks

项目配置了 Husky 和 Commitlint，提交代码时会自动：

- 运行 lint-staged 检查和格式化代码
- 验证 commit message 格式

Commit message 格式遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat: 新功能
fix: 修复bug
docs: 文档更新
style: 代码格式调整
refactor: 重构
perf: 性能优化
test: 测试相关
chore: 构建/工具链相关
```

## GitHub Actions

项目配置了 CI/CD 工作流：

- **CI**: 在 push 和 PR 时自动运行 lint、format check 和 build
- **Deploy**: 在推送到 main 分支时自动构建 Docker 镜像并部署

## 环境变量

后端 API 需要配置以下环境变量（创建 `apps/api/.env`）：

```env
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mydb
DB_USER=postgres
DB_PASSWORD=postgres
```

## 许可证

MIT
