; Rhizome 安装钩子：中文系统安装后程序名显示“龙盾”。
; 判定：GetUserDefaultUILanguage 的主语言 ID 为中文 (0x04)，与运行期 Rust 侧一致。
; 边界：仅改快捷方式名与卸载列表显示名；安装目录与卸载注册表键仍由 productName 派生。
; 注意：本文件在模板 !define（PRODUCTNAME/MAINBINARYNAME/UNINSTKEY 等）之前被 include，
; Function 体内只能使用运行时变量，编译期常量只能在 NSIS_HOOK_* 宏展开处引用。

Var ZhInstalled
Var ZhProductName

Function ZhIsChinese
  System::Call 'kernel32::GetUserDefaultUILanguage() i .r0'
  IntOp $0 $0 & 0x3FF
  ${If} $0 == 4
    Push 1
  ${Else}
    Push 0
  ${EndIf}
FunctionEnd

; 交互/被动安装时，桌面快捷方式由完成页复选框在安装段之后创建，
; 因此在安装器窗口关闭时统一改名为龙盾（重命名保留目标与 AppUserModelID）。
Function .onGUIEnd
  Call ZhIsChinese
  Pop $0
  ${If} $0 = 1
  ${AndIf} $ZhInstalled = 1
    ${If} ${FileExists} "$DESKTOP\$ZhProductName.lnk"
      ${If} ${FileExists} "$DESKTOP\龙盾.lnk"
        Delete "$DESKTOP\龙盾.lnk"
      ${EndIf}
      Rename "$DESKTOP\$ZhProductName.lnk" "$DESKTOP\龙盾.lnk"
    ${EndIf}
  ${EndIf}
FunctionEnd

!macro NSIS_HOOK_POSTINSTALL
  StrCpy $ZhProductName "${PRODUCTNAME}"
  Call ZhIsChinese
  Pop $0
  ${If} $0 = 1
    StrCpy $ZhInstalled 1

    ; 应用和功能/卸载程序显示名改为龙盾；注册表键路径不变，安装目录不受影响
    WriteRegStr SHCTX "${UNINSTKEY}" "DisplayName" "龙盾"

    ; 开始菜单快捷方式已在安装段内按原名创建，重命名为龙盾
    ${If} ${FileExists} "$SMPROGRAMS\${PRODUCTNAME}.lnk"
      ${If} ${FileExists} "$SMPROGRAMS\龙盾.lnk"
        Delete "$SMPROGRAMS\龙盾.lnk"
      ${EndIf}
      Rename "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$SMPROGRAMS\龙盾.lnk"
    ${EndIf}

    ; 桌面快捷方式：静默安装没有完成页、不会触发 .onGUIEnd，在此直接换名；
    ; 交互/被动安装交由 .onGUIEnd 处理
    ${If} ${Silent}
      ${If} ${FileExists} "$DESKTOP\${PRODUCTNAME}.lnk"
        ${If} ${FileExists} "$DESKTOP\龙盾.lnk"
          Delete "$DESKTOP\龙盾.lnk"
        ${EndIf}
        Rename "$DESKTOP\${PRODUCTNAME}.lnk" "$DESKTOP\龙盾.lnk"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; 与模板一致：更新 (/UPDATE) 触发的卸载保留快捷方式，供新版本复用
  ${If} $UpdateMode <> 1
    !insertmacro IsShortcutTarget "$SMPROGRAMS\龙盾.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$SMPROGRAMS\龙盾.lnk"
      Delete "$SMPROGRAMS\龙盾.lnk"
    ${EndIf}
    !insertmacro IsShortcutTarget "$DESKTOP\龙盾.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$DESKTOP\龙盾.lnk"
      Delete "$DESKTOP\龙盾.lnk"
    ${EndIf}
  ${EndIf}
!macroend
