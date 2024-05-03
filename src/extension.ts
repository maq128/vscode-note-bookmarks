import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'

const DATA_JSON_FILE = '.vscode/note-bookmarks.json'

export function activate(context: vscode.ExtensionContext) {
  const noteBookmarksView = new NoteBookmarksView()

  vscode.window.createTreeView('noteBookmarks.noteBookmarksTree', {
    treeDataProvider: noteBookmarksView,
    dragAndDropController: noteBookmarksView,
  })

  context.subscriptions.push(
    vscode.commands.registerCommand('noteBookmarks.addGroup', async () => {
      let newLabel = await vscode.window.showInputBox({
        prompt: '请输入书签/分组的标题:',
        value: '新的书签组',
      })
      if (!newLabel || !newLabel.trim()) return
      noteBookmarksView.newGroup(newLabel)
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('noteBookmarks.collapseAll', async () => {
      vscode.window.showWarningMessage('暂不支持【全部折叠】功能')
    })
  )

  context.subscriptions.push(
      vscode.commands.registerCommand('noteBookmarks.gotoBookmark', async (data) => {
      // 打开书签指定的文件
      let filepath = data.filepath
      if (!path.isAbsolute(filepath)) {
        filepath = path.join(vscode.workspace.rootPath??'', data.filepath)
      }
      let uri = vscode.Uri.file(filepath)
      vscode.window.showTextDocument(uri).then(editor => {
        // 跳转到书签指定的位置
        let pos = new vscode.Position(data.line, data.character)
        editor.selection = new vscode.Selection(pos, pos)
        let range = new vscode.Range(pos, pos)
        editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport)

        // 复核书签的内容
        if (!data.text?.length) return
        let document = editor.document
        let text = document.lineAt(data.line).text
        if (text === data.text) return

        // 修复缩进导致的变化
        let textTrim = data.text.trim()
        if (text.trim() === textTrim) {
          if (data.character >= text.length) {
            data.character = text.length
          }
          noteBookmarksView.onDataChanged(data)
          return
        }

        // 尝试修复书签位置（在前后 100 行范围内查找匹配的内容）
        let repaired = false
        let foundLine = 0
        for (let i = 1; i < 100; i++) {
          if (data.line + i < document.lineCount) {
            let text = document.lineAt(data.line + i).text
            if (text.trim() === textTrim) {
              foundLine = data.line + i
              repaired = true
              break
            }
          }
          if (data.line - i >= 0) {
            let text = document.lineAt(data.line - i).text
            if (text.trim() === textTrim) {
              foundLine = data.line - i
              repaired = true
              break
            }
          }
        }
        if (repaired) {
          // 修复书签位置
          data.line = foundLine
          let text = document.lineAt(foundLine).text
          if (data.character >= text.length) {
            data.character = text.length
          }
          noteBookmarksView.onDataChanged(data)

          // 重新按书签定位
          let pos = new vscode.Position(data.line, data.character)
          editor.selection = new vscode.Selection(pos, pos)
        } else {
          // 修复失败，后续不再尝试修复
          vscode.window.showWarningMessage('书签指向的内容已发生变化，且在附近未能找到原来的内容。')
          data.text = ''
          noteBookmarksView.onDataChanged(data)
        }
      })
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('noteBookmarks.addBookmark', async () => {
      let activeEditor = vscode.window.activeTextEditor
      if (!activeEditor) return
      let document = activeEditor.document
      let fileName = document.fileName
      let cursorPosition = activeEditor.selection.active

      let filepath = path.resolve(fileName)
      if (vscode.workspace.rootPath) {
        let rootPath = path.resolve(vscode.workspace.rootPath)
        if (filepath.startsWith(rootPath)) {
          filepath = path.relative(rootPath, filepath)
        }
      }
      let text = document.lineAt(cursorPosition.line).text
      noteBookmarksView.newBookmark(
        text.trim(),
        filepath,
        cursorPosition.line,
        cursorPosition.character,
        text,
      )
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('noteBookmarks.editBookmark', async (data) => {
      let newLabel = await vscode.window.showInputBox({
        prompt: '请输入书签/分组的标题:',
        value: data.label,
      })
      if (!newLabel || !newLabel.trim()) return
      data.label = newLabel
      noteBookmarksView.onDataChanged(data)
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('noteBookmarks.removeBookmark', async (data) => {
      if (!data) return
      if (data.children?.length) {
        let result = await vscode.window.showInformationMessage(
          `确定要将【${data.label}】连同子节点一起删除吗？`,
          { title: '确定', id: 'yes' },
          { title: '取消', id: 'no' }
        )
        if (result?.id !== 'yes') return
      }
      noteBookmarksView.removeBookmark(data.id)
    })
  )
}

class NoteBookmarksView implements vscode.TreeDataProvider<BookmarkData>, vscode.TreeDragAndDropController<BookmarkData> {
  private _onDidChangeTreeData: vscode.EventEmitter<BookmarkData | undefined>
  private roots: BookmarkData[]

  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter<BookmarkData>()
    this.roots = []
    this.onDidChangeTreeData = this._onDidChangeTreeData.event
    this.loadJsonFile()
  }

  loadJsonFile() {
    let rootPath = vscode.workspace.rootPath
    if (!rootPath) return
    let jsonFilePath = path.join(rootPath, DATA_JSON_FILE)
    // 检查 jsonFilePath 的 json 文件是否存在，如果存在则把内容读取到 roots 中
    if (!fs.existsSync(jsonFilePath)) return
    let json = fs.readFileSync(jsonFilePath, 'utf-8')
    this.roots = BookmarkData.parseFromJson(json)
  }

  saveJsonFile() {
    let rootPath = vscode.workspace.rootPath
    if (!rootPath) return
    let jsonFilePath = path.join(rootPath, DATA_JSON_FILE)
    fs.writeFile(
      jsonFilePath,
      JSON.stringify(
        this.roots,
        (key, value) => {
          if (key === 'id' || key === 'parent_id') return
          if (key === 'children' && value?.length === 0) return
          return value
        },
        2
      ),
      (err) => {
        if (err) {
          vscode.window.showErrorMessage('保存失败')
        }
      }
    )
  }

  // 书签数据有变化时刷新、保存
  onDataChanged(data: BookmarkData | undefined) {
    this._onDidChangeTreeData.fire(data)
    this.saveJsonFile()
  }

  // 新建一个分组（只有 label 没有其它属性）
  newGroup(label: string) {
    this.roots.push(new BookmarkData(label))
    this.onDataChanged(undefined)
  }

  // 新建一个书签
  newBookmark(label: string, filepath: string, line: number, character: number, text: string) {
    this.roots.push(new BookmarkData(
      label,
      filepath,
      line,
      character,
      text,
    ))
    this.onDataChanged(undefined)
  }

  // 删除指定的书签/分组
  removeBookmark(id: Number) {
    let data = this.getDataById(id)
    if (!data) return
    let parent = undefined
    let siblings = this.roots
    if (data.parent_id) {
      parent = this.getDataById(data.parent_id)
      siblings = parent?.children || []
    }
    let idx = siblings.findIndex(item => item.id === data.id)
    if (idx >= 0) {
      siblings.splice(idx, 1)
    }
    this.onDataChanged(parent)
  }

  getDataById(id: Number, children: BookmarkData[] = this.roots) : BookmarkData | undefined {
    for (let child of children) {
      if (child.id === id) return child
      if (child.children) {
        let result = this.getDataById(id, child.children)
        if (result) return result
      }
    }
    return undefined
  }

  //---- 实现 TreeDataProvider 接口

  public onDidChangeTreeData: vscode.Event<BookmarkData | BookmarkData[] | undefined | null | void>

  getTreeItem(data: BookmarkData): vscode.TreeItem {
    let treeItem = new Bookmark(
      data,
      data.children?.length
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None
    )
    if (data.filepath) {
      treeItem.tooltip = data.getLocation()
      treeItem.command = {
        command: 'noteBookmarks.gotoBookmark',
        title: 'Goto',
        arguments: [data],
      }
    }
    return treeItem
  }

  getChildren(data?: BookmarkData): Thenable<BookmarkData[]> {
    if (data) {
      return Promise.resolve(data?.children ?? [])
    }

    return Promise.resolve(this.roots)
  }

  //---- 实现 TreeDragAndDropController 接口

  dropMimeTypes = ['application/vnd.code.tree.noteBookmarks']
  dragMimeTypes = ['application/vnd.code.tree.noteBookmarks']

  handleDrag(source: BookmarkData[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken) {
    if (!source?.length) return
    dataTransfer.set('application/vnd.code.tree.noteBookmarks', new vscode.DataTransferItem(source[0]))
  }

  handleDrop(target: BookmarkData | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken) {
    if (token.isCancellationRequested) return
    let source = dataTransfer.get('application/vnd.code.tree.noteBookmarks')?.value
    if (!source?.id) return
    // if (source.id === target?.id) return

    if (!target) {
      // 把 source 移动到根节点的最后位置
      let sourceSiblings = source.parent_id ? this.getDataById(source.parent_id)!.children! : this.roots
      let sourceIdx = sourceSiblings.findIndex(data => data.id === source.id)
      sourceSiblings.splice(sourceIdx, 1)
      source.setParentId(undefined)
      this.roots.push(source)

    } else if (target.id === source.id) {
      // drop 到自己，则把 source 变为上一个临近节点的子节点
      let sourceSiblings = source.parent_id ? this.getDataById(source.parent_id)!.children! : this.roots
      let sourceIdx = sourceSiblings.findIndex(data => data.id === source.id)
      if (sourceIdx > 0 && !sourceSiblings[sourceIdx - 1].children?.length) {
        sourceSiblings.splice(sourceIdx, 1)
        let newParent = sourceSiblings[sourceIdx - 1]
        newParent.children = [source]
        source.setParentId(newParent.id)
      }

    } else if (target.parent_id === source.parent_id) {
      // 两者是兄弟节点，则把 source 移动到 target 原来的位置
      let siblings = this.roots
      if (source.parent_id) {
        let parent = this.getDataById(source.parent_id)
        siblings = parent!.children!
      }
      let sourceIdx = siblings.findIndex(data => data.id === source.id)
      let moved = siblings.splice(sourceIdx, 1)
      let targetIdx = siblings.findIndex(data => data.id === target?.id)
      siblings.splice(targetIdx < sourceIdx ? targetIdx : targetIdx + 1, 0, ...moved)

    } else {
      // 如果 target 是 source 的下游节点，则不能移动
      let descendant = this.getDataById(target.id, source.children ?? [])
      if (descendant) return

      // 把 source 移动到 target 子节点的最后位置
      let targetChildren = target.children = target.children || []
      let sourceSiblings = source.parent_id ? this.getDataById(source.parent_id)!.children! : this.roots
      let sourceIdx = sourceSiblings.findIndex(data => data.id === source.id)
      sourceSiblings.splice(sourceIdx, 1)
      source.setParentId(target?.id)
      targetChildren.push(source)
    }

    this.onDataChanged(undefined)
  }
}

class BookmarkData {
  static _seq = 1
  static nextId() {
    return BookmarkData._seq ++
  }

  static parseFromJson(json: string) {
    return JSON.parse(json, (key, value) => {
      if (key.length > 0 && Number.isInteger(Number(key))) {
        let { label, filepath, line, character: character, text, children } = value
        let result = new BookmarkData(
          label, filepath, line, character, text, children
        )
        children?.forEach((child: BookmarkData) => {
          child.setParentId(result.id)
        })
        return result
      }
      return value
    })
  }

  constructor(
    public label: string,
    public filepath?: string,
    public line?: number,
    public character?: number,
    public text?: string,
    public children?: BookmarkData[],
  ) {
    this.id = BookmarkData.nextId()
  }

  public id: Number
  public parent_id?: Number

  setParentId(parent_id: Number | undefined) {
    this.parent_id = parent_id
  }

  getLocation() {
    let location
    if (this.filepath) {
      location = this.filepath
      if (typeof this.line !== 'undefined') {
        location += `:${this.line}`
        if (typeof this.character !== 'undefined') {
          location += `:${this.character}`
        }
      }
    }
    return location
  }
}

class Bookmark extends vscode.TreeItem {
  constructor(
    public readonly data: BookmarkData,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(data.label, collapsibleState)
    let location = data.getLocation()
    if (location) {
      this.description = location
    }
  }
}
