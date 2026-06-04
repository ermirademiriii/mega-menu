import DynamicMegaMenuPlugin from './plugin/dynamic-mega-menu.plugin';

const PluginManager = window.PluginManager;

PluginManager.register(
    'DynamicMegaMenu',
    DynamicMegaMenuPlugin,
    '.main-navigation-menu'
);