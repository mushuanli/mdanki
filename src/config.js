export const STORAGE_KEYS = {
    SESSIONS: 'ankiSessions',
    FOLDERS: 'ankiFolders',
    CURRENT_SESSION_ID: 'currentSessionId',
    CURRENT_FOLDER_ID: 'currentFolderId',
    CURRENT_SUBSESSION_ID: 'currentSubsessionId',
    FOLDER_STACK: 'folderStack',
    CLOZE_TIMES: 'clozeAccessTimes'
};

export const DB_NAME = 'AnkiAppDB';
export const DB_VERSION = 2; // Start with version 2 as per the previous schema design

export const INITIAL_CONTENT = '# 新文件\n\n开始编写您的内容...\n\n使用 --内容-- 创建Cloze记忆卡片';