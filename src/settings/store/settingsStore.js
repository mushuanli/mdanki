// src/settings/store/settingsStore.js

import * as dataService from '../../services/dataService.js';
import { exportDatabase, importDatabase } from '../../services/dbService.js';

class SettingsStore {
    constructor() {
        this.state = {
            // Data state loaded from services
            apiConfigs: [],
            agents: [],
            settings: {
                theme: 'light',
                autoSaveInterval: 5,
            },

            // UI state for managing the view
            activeItemId: 'general',
            activeItemType: 'general',
            isCreating: false,
            isLoading: false,
            isSaving: false,
        };
        this.listeners = new Set();
    }

    getState() {
        return { ...this.state };
    }

    setState(updates) {
        const oldState = { ...this.state };
        const hasChanged = Object.keys(updates).some(key => this.state[key] !== updates[key]);
        if (!hasChanged) return;

        this.state = { ...this.state, ...updates };
        this.notify(oldState, this.state);
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify(oldState, newState) {
        this.listeners.forEach(listener => listener(newState, oldState));
    }

    // ======================================================
    //                   ACTIONS (业务逻辑)
    // ======================================================

    async initialize(initialData) {
        this.setState({
            apiConfigs: initialData.apiConfigs || [],
            agents: initialData.agents || [],
            settings: {
                theme: localStorage.getItem('app-theme') || 'light',
                autoSaveInterval: initialData.settings?.autoSaveInterval ?? 5,
            }
        });
    }

    selectItem(itemId, itemType) {
        this.setState({
            activeItemId: itemId,
            activeItemType: itemType,
            isCreating: false
        });
    }

    startCreatingItem(itemType) {
        this.setState({
            activeItemId: null,
            activeItemType: itemType,
            isCreating: true
        });
    }

    async saveCurrentItem(formData) {
        this.setState({ isSaving: true });
        try {
            const { activeItemType, isCreating } = this.state;
            let savedItem;

            if (activeItemType === 'apiConfig') {
                if (isCreating) {
                    savedItem = await dataService.addApiConfig(formData);
                    this.setState({ apiConfigs: [...this.state.apiConfigs, savedItem] });
                } else {
                    savedItem = await dataService.updateApiConfig(formData.id, formData);
                    this.setState({ apiConfigs: this.state.apiConfigs.map(c => c.id === formData.id ? savedItem : c) });
                }
            } else if (activeItemType === 'agent') {
                if (isCreating) {
                    savedItem = await dataService.addAgent(formData);
                    this.setState({ agents: [...this.state.agents, savedItem] });
                } else {
                    savedItem = await dataService.updateAgent(formData.id, formData);
                    this.setState({ agents: this.state.agents.map(a => a.id === formData.id ? savedItem : a) });
                }
            }

            // 保存成功后，自动选中该项目
            if (savedItem) {
                this.selectItem(savedItem.id, activeItemType);
            }

        } catch (error) {
            console.error("Save failed:", error);
            alert(`保存失败: ${error.message}`);
        } finally {
            this.setState({ isSaving: false });
        }
    }

    async deleteItem(itemId, itemType) {
        if (!confirm("确定要删除此配置吗？")) return;
        this.setState({ isLoading: true });
        try {
            if (itemType === 'apiConfig') {
                await dataService.deleteApiConfig(itemId);
                this.setState({ apiConfigs: this.state.apiConfigs.filter(c => c.id !== itemId) });
            } else if (itemType === 'agent') {
                await dataService.deleteAgent(itemId);
                this.setState({ agents: this.state.agents.filter(a => a.id !== itemId) });
            }
            // 删除后返回通用设置页
            this.selectItem('general', 'general');
        } catch (error) {
            console.error("Delete failed:", error);
            alert(`删除失败: ${error.message}`);
        } finally {
            this.setState({ isLoading: false });
        }
    }

    setTheme(themeName) {
        document.documentElement.setAttribute('data-theme', themeName || '');
        localStorage.setItem('app-theme', themeName);
        this.setState({ settings: { ...this.state.settings, theme: themeName } });
    }

    async setAutoSaveInterval(interval) {
        const newInterval = parseInt(interval, 10);
        if (!isNaN(newInterval) && newInterval >= 0) {
            this.setState({ settings: { ...this.state.settings, autoSaveInterval: newInterval } });
            await dataService.updateGlobalSetting('autoSaveInterval', newInterval);
            // 触发全局事件，通知 main.js 更新定时器
            window.dispatchEvent(new CustomEvent('app:settingChanged', { 
                detail: { key: 'autoSaveInterval', value: newInterval }
            }));
        }
    }

    async exportDb() {
        try {
            const data = await exportDatabase();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `smart-suite-backup-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            alert(`导出失败: ${error.message}`);
        }
    }

    async importDb(file) {
        if (!file) return;
        if (!confirm("警告！导入将覆盖所有现有数据。确定继续吗？")) return;
        try {
            const data = JSON.parse(await file.text());
            await importDatabase(data);
            alert("数据导入成功！应用即将刷新。");
            window.location.reload();
        } catch (error) {
            alert(`导入失败: ${error.message}`);
        }
    }
}

export const settingsStore = new SettingsStore();
