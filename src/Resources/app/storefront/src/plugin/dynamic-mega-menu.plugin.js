import Plugin from 'src/plugin-system/plugin.class';
import HttpClient from 'src/service/http-client.service';

const HOVER_DEBOUNCE_MS = 180;
const PANEL_ACTIVE_CLASS = 'mega-menu-panel--active';
const TRIGGER_ACTIVE_CLASS = 'mega-menu-trigger--active';

export default class DynamicMegaMenuPlugin extends Plugin {

    static options = {
        triggerSelector: '[data-mega-menu="true"]',
        panelSelector: '.mega-menu-panel',
        loadingSelector: '.mega-menu-loading',
        listSelector: '.mega-menu-subcategory-list',
        navigationEndpoint: '/navigation',
        depth: 1,
    };

    init() {
        this._client = new HttpClient();
        this._cache = {};
        this._hoverTimer = null;
        this._activeTrigger = null;
        this._activePanel = null;

        this._triggers = this.el.querySelectorAll(this.options.triggerSelector);

        if (!this._triggers.length) {
            return;
        }

        this._registerEvents();
    }

    _registerEvents() {
        this._triggers.forEach((trigger) => {
            // Mouse interactions
            trigger.addEventListener('mouseenter', this._onTriggerMouseEnter.bind(this, trigger));
            trigger.addEventListener('mouseleave', this._onTriggerMouseLeave.bind(this));

            // Touch / click (toggle)
            trigger.addEventListener('click', this._onTriggerClick.bind(this, trigger));

            // Keyboard support
            trigger.addEventListener('keydown', this._onTriggerKeyDown.bind(this, trigger));

            // Keep panel open when hovering over it
            const panel = this._getPanelForTrigger(trigger);
            if (panel) {
                panel.addEventListener('mouseenter', this._onPanelMouseEnter.bind(this));
                panel.addEventListener('mouseleave', this._onPanelMouseLeave.bind(this, trigger));
            }
        });

        // Close on outside click
        document.addEventListener('click', this._onDocumentClick.bind(this));

        // Close on Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this._closeActivePanel();
            }
        });
    }

    _onTriggerMouseEnter(trigger) {
        clearTimeout(this._hoverTimer);
        this._hoverTimer = setTimeout(() => {
            this._openPanel(trigger);
        }, HOVER_DEBOUNCE_MS);
    }

    _onTriggerMouseLeave() {
        clearTimeout(this._hoverTimer);
        this._hoverTimer = setTimeout(() => {
            this._closeActivePanel();
        }, HOVER_DEBOUNCE_MS + 80);
    }

    _onPanelMouseEnter() {
        clearTimeout(this._hoverTimer);
    }

    _onPanelMouseLeave(trigger) {
        clearTimeout(this._hoverTimer);
        this._hoverTimer = setTimeout(() => {
            this._closeActivePanel();
        }, HOVER_DEBOUNCE_MS + 80);
    }

    _onTriggerClick(trigger, event) {
        event.preventDefault();
        event.stopPropagation();

        const panel = this._getPanelForTrigger(trigger);
        if (!panel) return;

        const isOpen = !panel.hidden;

        if (isOpen) {
            this._closeActivePanel();
        } else {
            this._closeActivePanel();
            this._openPanel(trigger);
        }
    }

    _onTriggerKeyDown(trigger, event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this._onTriggerClick(trigger, event);
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            const panel = this._getPanelForTrigger(trigger);
            if (panel) {
                const firstLink = panel.querySelector('a');
                if (firstLink) firstLink.focus();
            }
        }
    }

    _onDocumentClick(event) {
        if (!this._activePanel) return;
        if (!this.el.contains(event.target)) {
            this._closeActivePanel();
        }
    }

    _openPanel(trigger) {
        const categoryId = trigger.dataset.megaMenuId;
        const panel = this._getPanelForTrigger(trigger);

        if (!categoryId || !panel) return;

        // Close any currently open panel first
        if (this._activeTrigger && this._activeTrigger !== trigger) {
            this._closeActivePanel();
        }

        this._activeTrigger = trigger;
        this._activePanel = panel;

        trigger.setAttribute('aria-expanded', 'true');
        trigger.classList.add(TRIGGER_ACTIVE_CLASS);
        panel.removeAttribute('hidden');
        panel.classList.add(PANEL_ACTIVE_CLASS);

        // Load subcategories if not already cached
        if (this._cache[categoryId]) {
            this._renderSubcategories(panel, this._cache[categoryId]);
        } else {
            this._fetchSubcategories(categoryId, panel);
        }
    }

    _closeActivePanel() {
        if (this._activeTrigger) {
            this._activeTrigger.setAttribute('aria-expanded', 'false');
            this._activeTrigger.classList.remove(TRIGGER_ACTIVE_CLASS);
            this._activeTrigger = null;
        }
        if (this._activePanel) {
            this._activePanel.setAttribute('hidden', '');
            this._activePanel.classList.remove(PANEL_ACTIVE_CLASS);
            this._activePanel = null;
        }
    }

    _fetchSubcategories(categoryId, panel) {
        const list = panel.querySelector(this.options.listSelector);
        const loading = panel.querySelector(this.options.loadingSelector);

        if (list) list.innerHTML = '';
        if (loading) {
            loading.removeAttribute('hidden');
            loading.setAttribute('aria-busy', 'true');
        }

        const url = `${this.options.navigationEndpoint}/${categoryId}/${categoryId}?depth=${this.options.depth}&buildTree=false`;

        this._client.get(url, (responseText) => {
            if (loading) {
                loading.setAttribute('hidden', '');
                loading.setAttribute('aria-busy', 'false');
            }

            let data;
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                this._renderError(panel, 'Failed to parse response.');
                return;
            }

            // Shopware navigation endpoint returns { children: [...] } or a flat array
            const categories = this._extractCategories(data);

            // Filter to active only and cache result
            const active = categories.filter((cat) => cat.active);
            this._cache[categoryId] = active;
            this._renderSubcategories(panel, active);
        });
    }

    _extractCategories(data) {
        // Shopware 6 store-api /navigation returns { children: [...] } tree
        if (data && Array.isArray(data.children)) {
            return data.children;
        }
        // Fallback: flat elements array
        if (data && data.elements && Array.isArray(data.elements)) {
            return data.elements;
        }
        // Fallback: the response might itself be an array
        if (Array.isArray(data)) {
            return data;
        }
        return [];
    }

    _renderSubcategories(panel, categories) {
        const list = panel.querySelector(this.options.listSelector);
        if (!list) return;

        if (!categories.length) {
            list.innerHTML = '<li class="mega-menu-empty">No subcategories available.</li>';
            return;
        }

        const items = categories.map((cat) => {
            const name = this._getCategoryName(cat);
            const url = this._getCategoryUrl(cat);
            const imageUrl = this._getCategoryImage(cat);

            const imgHtml = imageUrl
                ? `<img class="mega-menu-item-image" src="${this._escapeHtml(imageUrl)}" alt="${this._escapeHtml(name)}" loading="lazy" width="80" height="80">`
                : `<span class="mega-menu-item-image mega-menu-item-image--placeholder" aria-hidden="true"></span>`;

            return `
                <li class="mega-menu-subcategory-item" role="listitem">
                    <a href="${this._escapeHtml(url)}"
                       class="mega-menu-subcategory-link"
                       tabindex="0">
                        ${imgHtml}
                        <span class="mega-menu-item-name">${this._escapeHtml(name)}</span>
                    </a>
                </li>
            `.trim();
        });

        list.innerHTML = items.join('');
    }

    _renderError(panel, message) {
        const list = panel.querySelector(this.options.listSelector);
        if (list) {
            list.innerHTML = `<li class="mega-menu-error">${this._escapeHtml(message)}</li>`;
        }
    }

    _getCategoryName(cat) {
        if (cat.translated && cat.translated.name) {
            return cat.translated.name;
        }
        if (cat.name) {
            return cat.name;
        }
        return 'Category';
    }

    _getCategoryUrl(cat) {
        // Prefer SEO URL if available
        if (cat.seoUrls && cat.seoUrls.length > 0) {
            const seoUrl = cat.seoUrls.find((s) => s.isCanonical) || cat.seoUrls[0];
            if (seoUrl && seoUrl.seoPathInfo) {
                return `/${seoUrl.seoPathInfo}`;
            }
        }
        // Fallback to standard navigation URL
        return `/navigation/${cat.id}`;
    }

    _getCategoryImage(cat) {
        // Check decorator-injected custom field first
        if (cat.customFields && cat.customFields._mediaUrl) {
            return cat.customFields._mediaUrl;
        }
        // Check media object directly
        if (cat.media && cat.media.url) {
            return cat.media.url;
        }
        return null;
    }

    _getPanelForTrigger(trigger) {
        const categoryId = trigger.dataset.megaMenuId;
        return categoryId
            ? document.getElementById(`mega-menu-panel-${categoryId}`)
            : null;
    }

    _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}