import BinaryCheckbox from "./BinaryCheckbox.vue";
import BrowseSelectButton from "./BrowseSelectButton.vue";
import ConfigFoldCard from "./ConfigFoldCard.vue";
import FeatureToggle from "./FeatureToggle.vue";
import HistorySessionPanel from "./HistorySessionPanel.vue";
import InfoFeedResultRow from "./InfoFeedResultRow.vue";
import OptionBar from "./OptionBar.vue";
import StatusPill from "./StatusPill.vue";

export { BinaryCheckbox, BrowseSelectButton, ConfigFoldCard, FeatureToggle, HistorySessionPanel, InfoFeedResultRow, OptionBar, StatusPill };

export type CommonComponentRegistration = {
  name: string;
  file: string;
  category: "choice" | "picker" | "history" | "result" | "config";
  description: string;
  usageRule: string;
};

export const commonComponentRegistry: CommonComponentRegistration[] = [
  {
    name: "BinaryCheckbox",
    file: "server-web/components/BinaryCheckbox.vue",
    category: "choice",
    description: "独立布尔选项的标准复选控件。",
    usageRule: "页面需要复选框式布尔开关时使用；不要替代胶囊型二态 Toggle。",
  },
  {
    name: "OptionBar",
    file: "server-web/components/OptionBar.vue",
    category: "choice",
    description: "选项栏的标准选择控件外壳。",
    usageRule: "页面需要下拉选项栏时使用；选项列表和值必须由调用方传入，组件不得写默认业务值。",
  },
  {
    name: "FeatureToggle",
    file: "server-web/components/FeatureToggle.vue",
    category: "choice",
    description: "功能、模块、授权等启停状态的标准胶囊 Toggle。",
    usageRule: "页面需要表达某个功能是否开启并允许直接启停时使用；组件只发出布尔值，启停逻辑和保存行为由调用方绑定。",
  },
  {
    name: "StatusPill",
    file: "server-web/components/StatusPill.vue",
    category: "result",
    description: "状态展示的标准圆点胶囊。",
    usageRule: "页面需要展示运行状态、配置状态、风险等级或启用状态时使用；只传入 label/tone/enabled，不在业务页面手写状态胶囊。",
  },
  {
    name: "BrowseSelectButton",
    file: "server-web/components/BrowseSelectButton.vue",
    category: "picker",
    description: "文件、文件夹、本地路径选择入口。",
    usageRule: "页面需要触发浏览文件、文件夹或本地路径选择时使用，按钮文案和选择类型由调用方传入。",
  },
  {
    name: "ConfigFoldCard",
    file: "server-web/components/ConfigFoldCard.vue",
    category: "config",
    description: "配置、JSON、运行结构和诊断信息的标准折叠卡片。",
    usageRule: "页面需要展开/收起配置、JSON、诊断结构或详情时使用；具体表单、JSON 和数据内容由调用方通过 slot 提供。",
  },
  {
    name: "HistorySessionPanel",
    file: "server-web/components/HistorySessionPanel.vue",
    category: "history",
    description: "可折叠、可选择、可删除的历史会话列表。",
    usageRule: "页面需要历史会话、历史记录或可恢复运行列表时使用；列表数据和删除行为由调用方绑定。",
  },
  {
    name: "InfoFeedResultRow",
    file: "server-web/components/InfoFeedResultRow.vue",
    category: "result",
    description: "信息流和调试面板复用的结果行渲染组件。",
    usageRule: "需要与信息流结果保持一致的召回/规划结果展示时使用，避免重新绘制相似卡片。",
  },
];
