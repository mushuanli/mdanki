// src/settings/components/NavComponent.js

import { escapeHTML } from '../../common/utils.js';

export class NavComponent {
    constructor(store) {
        this.store = store;
        this.element = document.getElementById('settings_navList');
        
        this.setupEventListeners();
        this.unsubscribe = store.subscribe(this.handleStateChange.bind(this));
    }

    setupEventListeners() {
        this.element.addEventListener('click', (e) => {
            const navItem = e.target.closest('.settings-nav-item');
            if (navItem) {
                const { id, type } = navItem.dataset;
                this.store.selectItem(id, type);
                return;
            }

            const addBtn = e.target.closest('.add-item-btn');
            if (addBtn) {
                this.store.startCreatingItem(addBtn.dataset.type);
            }
        });
    }

    handleStateChange(newState, oldState) {
        // 仅当数据或选中项变化时才重新渲染导航
        if (
            newState.apiConfigs !== oldState.apiConfigs ||
            newState.agents !== oldState.agents ||
            newState.activeItemId !== oldState.activeItemId
        ) {
            this.render(newState);
        }
    }

    render(state) {
        if (!this.element) return;
        this.element.innerHTML = ''; // 清空旧内容

        const generalItem = this._createNavItem({ id: 'general', type: 'general', name: '应用设置' }, state);
        this.element.appendChild(generalItem);

        const apiConfigs = state.apiConfigs.map(c => ({ id: c.id, name: c.name, type: 'apiConfig' }));
        const agents = state.agents.map(a => ({ id: a.id, name: a.name, type: 'agent' }));

        this.element.appendChild(this._createNavGroup('API 配置', apiConfigs, 'apiConfig', state));
        this.element.appendChild(this._createNavGroup('Agent 配置', agents, 'agent', state));
    }

    _createNavItem(item, state) {
        const li = document.createElement('li');
        li.className = 'settings-nav-item';
        li.dataset.id = item.id;
        li.dataset.type = item.type;
        if (item.id === state.activeItemId) {
            li.classList.add('active');
        }

        let iconClass = 'fa-cog';
        if (item.type === 'apiConfig') iconClass = 'fa-key';
        else if (item.type === 'agent') iconClass = 'fa-robot';

        li.innerHTML = `<i class="fas ${iconClass}"></i><span>${escapeHTML(item.name)}</span>`;
        return li;
    }

    _createNavGroup(title, items, type, state) {
        const fragment = document.createDocumentFragment();
        const group = document.createElement('div');
        group.className = 'settings-nav-group';
        group.innerHTML = `
            <h4 class="settings-nav-group-title">${title}</h4>
            <button class="add-item-btn" data-type="${type}"><i class="fas fa-plus"></i> 添加</button>`;
        
        const ul = document.createElement('ul');
        items.forEach(item => ul.appendChild(this._createNavItem(item, state)));
        group.appendChild(ul);
        fragment.appendChild(group);
        return fragment;
    }

    destroy() {
        this.unsubscribe();
        // Event listeners are on a single element and will be garbage collected with it.
    }
}
