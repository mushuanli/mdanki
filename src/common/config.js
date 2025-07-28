// src/common/config.js

// [修正] 数据库名称，与 db.js 保持一致
export const DB_NAME = 'MdAnkiDatabase';

export const DB_VERSION = 2; // Start with version 2 as per the previous schema design

export const INITIAL_CONTENT = '# 新文件\n\n开始编写您的内容...\n\n::> 这是一个可折叠的标题\n    这里是折叠的内容。\n    - 甚至可以包含列表\n    - 和其他 Markdown 元素。\n    ```javascript\n    // 也可以包含代码块\n    console.log(\'Hello, Toggle!\');\n    ```\n\n这一行不再缩进，所以它不属于上面的折叠块。\n\n::> [ ] 这是一个可折叠的并且可以记录完成情况的标题\n- [ ] 完成情况 \n\n使用 --内容-- 创建Cloze记忆卡片, 可以有声音: --你好--^^audio:hello^^ ';