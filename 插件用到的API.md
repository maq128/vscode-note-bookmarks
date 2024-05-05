# 插件用到的 API

## package.json

- contributes
  - viewsContainers 在侧边栏显示一个窗格
  - views 在侧边栏窗格里显示书签的视图
  - commands 声明各种操作命令
  - menus
    - editor/context 在编辑器的上下文菜单中注册一个菜单项
    - view/title 在书签视图的顶部放置操作按钮
    - view/item/context 在书签视图的列表项上放置操作按钮

## 文档编辑器操作

- 在编辑器中打开指定的文件，并将文本光标移动到指定的行和列
- 把编辑器中的文档内容卷滚到显示指定的行和列
- 在编辑器中通过上下文菜单触发命令
- 获取当前编辑器里面文本光标的位置
- 获取编辑器中文档在指定行的内容

## TreeView

- vscode.window.createTreeView 创建一个 TreeView
- vscode.TreeDataProvider 以数据驱动的方式渲染 TreeView
- vscode.TreeDragAndDropController 支持树节点的拖放操作

## 其它基础操作

- vscode.commands.registerCommand 注册命令处理函数
- vscode.window.showInputBox 显示一个文本输入框
- vscode.window.showWarningMessage 显示一条警告消息
- vscode.window.showErrorMessage 显示一条报错消息
