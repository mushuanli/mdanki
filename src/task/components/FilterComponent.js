// src/task/components/FilterComponent.js
export class FilterComponent {
    constructor(store) {
        this.store = store;
        this.dom = {
            subject: document.getElementById('task_subjectFilter'),
            tags: document.getElementById('task_tagFilterContainer'),
            reasons: document.getElementById('task_reasonFilterContainer'),
        };
        this.unsubscribe = store.subscribe(this.render.bind(this), ['taxonomy', 'filters']);
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.dom.subject.addEventListener('change', e => {
            this.store.setFilters({ subject: e.target.value, tags: [], reasons: [] });
        });
        const handleFilterClick = (type, e) => {
            const target = e.target.closest('.tag');
            if (!target) return;
            target.classList.toggle('active');
            const activeValues = Array.from(e.currentTarget.querySelectorAll('.tag.active')).map(el => el.dataset.value);
            this.store.setFilters({ [type]: activeValues });
        };
        this.dom.tags.addEventListener('click', handleFilterClick.bind(this, 'tags'));
        this.dom.reasons.addEventListener('click', handleFilterClick.bind(this, 'reasons'));
    }

    render({ taxonomy, filters }) {
        this.dom.subject.innerHTML = '<option value="all">所有任务</option>';
        Object.keys(taxonomy).sort().forEach(s => {
            this.dom.subject.add(new Option(s, s, false, s === filters.subject));
        });

        const subjectData = taxonomy[filters.subject] || { tags: new Set(), reasons: new Set() };
        this._renderAccordion(this.dom.tags, '标签类型', Array.from(subjectData.tags).sort(), filters.tags);
        this._renderAccordion(this.dom.reasons, '任务状态', Array.from(subjectData.reasons).sort(), filters.reasons);
    }

    _renderAccordion(container, title, items, activeItems) {
        const activeSet = new Set(activeItems);
        container.innerHTML = `<details class="filter-accordion-item" open><summary><span><i class="fas fa-tags"></i> ${title}</span></summary><div class="tag-list-content">${items.map(item => `<div class="tag ${activeSet.has(item) ? 'active' : ''}" data-value="${item}">${item}</div>`).join('')}</div></details>`;
    }

    destroy() { this.unsubscribe(); }
}