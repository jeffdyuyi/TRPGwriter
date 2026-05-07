# TRPG Writer - 云端存储后端整合技术规范 (Backend Integration Spec)

## 1. 概述 (Overview)
本文档旨在为后端开发团队提供 TRPG Writer（纯前端工具）接入现有网站云端存储功能的标准化技术说明。
通过实现本文档中定义的数据库结构和 RESTful API 接口，前端工具将能够实现用户文档（人物卡、剧本、设定集等数据的 JSON/Markdown 格式）在云端的持久化存储、同步与多端访问。

---

## 2. 架构与安全 (Architecture & Security)

### 2.1 鉴权机制 (Authentication)
*   **状态保持**：API 应完全复用现有网站的登录状态机制（如 Cookie/Session 或 JWT Token）。
*   **请求头携带**：前端在发送 `fetch/axios` 请求时，将配置携带凭证（`credentials: 'include'` 或在 Header 中附带 `Authorization: Bearer <token>`）。
*   **统一拦截**：所有涉及文档读写的 API 必须经过鉴权中间件，未登录状态统一返回 `401 Unauthorized`。

### 2.2 越权访问防护 (BOLA/IDOR Protection)
*   **强校验**：针对具体文档的读取、更新、删除操作，**必须校验**该文档所属的 `user_id` 是否与当前发起请求的登录用户 ID 一致。严禁仅凭 `document_id` 进行数据操作。

### 2.3 CORS (跨域资源共享)
*   如果 TRPG Writer 部署在独立子域名（如 `editor.yourdomain.com`）而 API 在主域名（如 `api.yourdomain.com`），后端需要配置 CORS，允许特定的 `Origin`，并允许携带凭证（`Access-Control-Allow-Credentials: true`）。

---

## 3. 数据库设计建议 (Database Schema)

建议在现有数据库中新增一张独立的文档表/集合。以下为关系型数据库（如 MySQL/PostgreSQL）的结构参考：

### 表名: `trpg_documents`

| 字段名 (Field) | 类型 (Type) | 约束/说明 (Description) |
| :--- | :--- | :--- |
| `id` | VARCHAR/UUID | 主键 (Primary Key)，建议使用 UUID 避免 ID 猜测 |
| `user_id` | INT/VARCHAR | 外键 (Foreign Key)，关联现有用户表，建立索引 |
| `title` | VARCHAR(255) | 文档标题，供列表展示 |
| `type` | VARCHAR(50) | (可选) 预留字段，用于区分文档类型（如 'character', 'campaign', 'notes'） |
| `content` | LONGTEXT/JSON | 核心字段：存储前端生成的序列化数据（JSON 或 Markdown 文本） |
| `created_at` | DATETIME | 记录创建时间 |
| `updated_at` | DATETIME | 记录最后修改时间 |

---

## 4. API 接口规范 (RESTful API Endpoints)

基础路径 (Base URL)：`/api/trpg` (可根据实际项目规范调整)

### 4.1 获取当前用户的文档列表
*   **Method**: `GET`
*   **Endpoint**: `/api/trpg/documents`
*   **Description**: 获取当前登录用户的所有文档元数据列表（不包含具体内容，以减少带宽消耗）。
*   **Response (200 OK)**:
    ```json
    {
      "code": 200,
      "message": "success",
      "data": [
        {
          "id": "uuid-1234",
          "title": "龙与地下城：矿坑剧本",
          "type": "campaign",
          "updated_at": "2026-05-07T14:30:00Z"
        },
        // ...
      ]
    }
    ```

### 4.2 获取单个文档内容
*   **Method**: `GET`
*   **Endpoint**: `/api/trpg/documents/:id`
*   **Description**: 根据文档 ID 获取完整的文档数据，用于前端加载编辑器。
*   **Response (200 OK)**:
    ```json
    {
      "code": 200,
      "message": "success",
      "data": {
        "id": "uuid-1234",
        "title": "龙与地下城：矿坑剧本",
        "content": "{\"characters\": [], \"notes\": \"...\"}", 
        "updated_at": "2026-05-07T14:30:00Z"
      }
    }
    ```
*   **Response (403 Forbidden / 404 Not Found)**:
    *   当文档不属于当前用户或不存在时返回。

### 4.3 创建新文档 (云端另存为)
*   **Method**: `POST`
*   **Endpoint**: `/api/trpg/documents`
*   **Description**: 将前端新建的文档保存到云端数据库。
*   **Request Body**:
    ```json
    {
      "title": "未命名人物卡",
      "type": "character",
      "content": "{\"attributes\": {\"STR\": 15}}"
    }
    ```
*   **Response (201 Created)**:
    ```json
    {
      "code": 201,
      "message": "created",
      "data": {
        "id": "uuid-5678",
        "created_at": "2026-05-07T14:35:00Z"
      }
    }
    ```

### 4.4 更新文档 (覆盖保存)
*   **Method**: `PUT` (或 `PATCH`)
*   **Endpoint**: `/api/trpg/documents/:id`
*   **Description**: 前端点击“保存”时，覆盖云端对应的文档内容。
*   **Request Body**:
    ```json
    {
      "title": "更新后的标题",
      "content": "{\"attributes\": {\"STR\": 16}}"
    }
    ```
*   **Response (200 OK)**:
    ```json
    {
      "code": 200,
      "message": "updated",
      "data": {
        "updated_at": "2026-05-07T14:40:00Z"
      }
    }
    ```

### 4.5 删除文档
*   **Method**: `DELETE`
*   **Endpoint**: `/api/trpg/documents/:id`
*   **Description**: 将指定文档移至回收站或永久删除。
*   **Response (200 OK)**:
    ```json
    {
      "code": 200,
      "message": "deleted"
    }
    ```

---

## 5. 前后端对接流程建议
1.  **后端先行**：后端按照此规范建立数据表，并提供联调环境的 API。
2.  **Mock 测试**：使用 Postman 或类似工具测试接口，确保鉴权与越权拦截正常生效。
3.  **前端改造**：前端开发者将本地的 `File System API` 或 `localStorage` 逻辑替换为封装好的网络请求服务（如 `apiService.js`）。
4.  **异常处理**：前端需妥善处理网络断开、登录过期（401状态码跳回登录页）、保存失败等异常情况，防止用户数据丢失（可配合本地缓存作为降级方案）。
