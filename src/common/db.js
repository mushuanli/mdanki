// src/common/db.js
import Dexie from 'dexie'; // Assuming you're using a bundler. If not, Dexie will be global.
import { DB_NAME, DB_VERSION } from './config.js';

export const db = new Dexie(DB_NAME);

/**
 * 定义数据库 schema。
 * 每次修改此处的 `stores` 对象，都必须在 config.js 中增加 DB_VERSION 的值。
 */
db.version(DB_VERSION).stores({
    // [修正] 将 'id' 定义为唯一主键 (&id)，以匹配 generateId() 的行为。
    folders: '&id, name, folderId',
    sessions: '&id, name, folderId, createdAt, lastActive',

    // [新增] clozeStates 表，用于存储卡片的SRS状态。主键是 'id'。
    clozeStates: '&id, fileId, state, due',
    
    // appState 用于存储简单的、非集合类的持久化状态。
    appState: '&key',
    // &uuid: 主键，保证唯一性
    // subject: 按科目索引
    // *tags: 多值索引，用于标签筛选
    // analysis.reason_for_error: 按错误原因索引
    // review.due: 按复习到期时间索引，用于排序和查询
    mistakes: '&uuid, subject, *tags, analysis.reason_for_error, review.due',
    reviewStats: '&id, date, folderId',

    // [废弃] 旧的 Agent 表
    // agents: '&id, &name',
    // topics: '&id, agentId, createdAt',
    // history: '&id, topicId, timestamp',

    // [新增] 新的配置表
    apiConfigs: '&id, name', // API 配置
    agents: '&id, name',      // 角色配置 (以前的 Agent)

    // [修改] history 和 topics 表现在关联到 promptId
    topics: '&id, agentId, createdAt',
    history: '&id, topicId, timestamp, agentId',
});
