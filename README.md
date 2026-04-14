# 实验室管理系统（机房版）

用于学院机房实验室的基础管理系统，覆盖管理员录入与查看者只读场景。

## 当前已实现

- 角色区分：`admin`（可编辑）与 `viewer`（只读）
- 访问方式：游客默认查看（`viewer`），管理员通过账号密码登录获得编辑权限
- 模块页面：
	- 仪表盘
	- 实验室管理（填写实验室情况）
	- 电脑配置与状态管理
	- 电脑维修记录管理
	- 报表统计（设备台套数、价值、每月使用分钟数、活动分钟数）
- Supabase 接入准备：
	- 客户端封装：`lib/supabase-client.ts`
	- 环境变量示例：`.env.example`
	- 数据表与 RLS 策略：`supabase/schema.sql`

> 说明：当前页面默认使用本地示例数据演示流程；将其切换为 Supabase 真库后即可落库。

## 本地运行

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

```bash
copy .env.example .env.local
```

然后在 `.env.local` 中填写你的 Supabase 项目地址与匿名 Key。

如需修改管理员账号密码，也可在 `.env.local` 中配置：

```bash
ADMIN_USERNAME=admin
ADMIN_PASSWORD=LabAdmin@2026
```

3. 启动开发环境

```bash
npm run dev
```

访问 `http://localhost:3000`。

## Supabase 初始化

在 Supabase SQL Editor 中执行 `supabase/schema.sql`。

建议后续补充：

- 使用 Supabase Auth 登录并把 `profiles.role` 与账号绑定
- 用真实表数据替换 `lib/demo-data.ts`
- 将页面中的新增/更新操作改为 `insert`/`update`

## 常用脚本

- `npm run dev`：开发模式
- `npm run lint`：代码检查
- `npm run build`：生产构建
- `npm run start`：生产启动
