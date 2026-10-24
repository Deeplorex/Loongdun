; Loongdun 安装钩子（公司品牌 Deeplorex，产品 Loongdun，中文系统显示“龙盾”）。
; 职责：
; 1. 默认安装目录 %LOCALAPPDATA%\Deeplorex\Loongdun 由自定义模板
;    installer-template.nsi（BRAND_INSTALL_DIR）在 .onInit 决定，目录页、静默安装
;    与实际落盘一致；用户自定义位置和注册表恢复的上次位置不受影响，本钩子不参与。
; 2. 旧版升级迁移：检测旧品牌「Rhizome 密钥库」的卸载项，静默运行其卸载器并清理残留
;    （目录、卸载注册表键、指向旧目录的快捷方式），避免升级后同时存在两份安装。
;    用户库数据不在此处理，由应用启动时的 Rust 侧迁移（migration.rs）负责。
; 3. 中文系统显示名：GetUserDefaultUILanguage 主语言 ID 为中文 (0x04) 时，快捷方式与
;    “应用和功能”卸载项显示“龙盾”，与运行期 Rust 侧 branding.rs 同口径；其他语言保持
;    productName「Loongdun」。
; 注意：本文件在模板 !define（PRODUCTNAME/MAINBINARYNAME/UNINSTKEY 等）之前被 include，
; Function 体内只能使用运行时变量，编译期常量只能在 NSIS_HOOK_* 宏展开处引用。

!define COMPANY_DIR_NAME "Deeplorex"
!define PRODUCT_DIR_NAME "Loongdun"
!define LEGACY_PRODUCT_NAME "Rhizome 密钥库"
!define LEGACY_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${LEGACY_PRODUCT_NAME}"

Var ZhInstalled
Var ZhProductName
Var LegacyDir
Var LegacyUninstaller

Function ZhIsChinese
  System::Call 'kernel32::GetUserDefaultUILanguage() i .r0'
  IntOp $0 $0 & 0x3FF
  ${If} $0 == 4
    Push 1
  ${Else}
    Push 0
  ${EndIf}
FunctionEnd

; 删除指向旧安装目录的快捷方式（仅当目标确为旧主程序 rhizome.exe 时）。
; 必须定义在 UninstallLegacyRhizome 之前：函数体在解析期展开本宏。
!macro RemoveLegacyShortcut SHORTCUT
  ${If} ${FileExists} "${SHORTCUT}"
    !insertmacro IsShortcutTarget "${SHORTCUT}" "$LegacyDir\rhizome.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "${SHORTCUT}"
      Delete "${SHORTCUT}"
    ${EndIf}
  ${EndIf}
!macroend

; 卸载旧品牌版本（Rhizome 密钥库）。找不到旧卸载项时立即返回；
; 兜底清理只针对旧默认目录，绝不递归删除用户自定义的安装位置。
Function UninstallLegacyRhizome
  StrCpy $LegacyDir ""
  StrCpy $LegacyUninstaller ""
  ReadRegStr $LegacyUninstaller SHCTX "${LEGACY_UNINSTKEY}" "UninstallString"
  ReadRegStr $LegacyDir SHCTX "${LEGACY_UNINSTKEY}" "InstallLocation"
  ${If} $LegacyUninstaller == ""
  ${AndIf} $LegacyDir == ""
    Return
  ${EndIf}

  ; InstallLocation 形如 "C:\...\Rhizome 密钥库"（带引号），去掉首尾引号
  StrCpy $0 $LegacyDir 1
  ${If} $0 == '"'
    StrCpy $LegacyDir $LegacyDir "" 1
    StrCpy $LegacyDir $LegacyDir -1
  ${EndIf}
  ${If} $LegacyDir == ""
    StrCpy $LegacyDir "$LOCALAPPDATA\${LEGACY_PRODUCT_NAME}"
  ${EndIf}

  ${If} ${FileExists} "$LegacyDir\uninstall.exe"
    ; /S 静默；_?= 让卸载器在原目录原地运行并等待结束（其自身与目录随后兜底清理）
    DetailPrint "卸载旧版本：$LegacyDir"
    ExecWait '"$LegacyDir\uninstall.exe" /S _?=$LegacyDir' $0
  ${EndIf}

  ; 兜底：旧卸载器静默失败或残留文件时清理（仅限旧默认目录）
  ${If} $LegacyDir == "$LOCALAPPDATA\${LEGACY_PRODUCT_NAME}"
  ${AndIf} ${FileExists} "$LegacyDir\*.*"
    RmDir /r "$LegacyDir"
  ${EndIf}
  DeleteRegKey SHCTX "${LEGACY_UNINSTKEY}"

  ; 指向旧目录的快捷方式残留（旧卸载器未能运行时）：仅当目标确为旧主程序时删除
  !insertmacro RemoveLegacyShortcut "$SMPROGRAMS\${LEGACY_PRODUCT_NAME}.lnk"
  !insertmacro RemoveLegacyShortcut "$SMPROGRAMS\龙盾.lnk"
  !insertmacro RemoveLegacyShortcut "$DESKTOP\${LEGACY_PRODUCT_NAME}.lnk"
  !insertmacro RemoveLegacyShortcut "$DESKTOP\龙盾.lnk"
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ; 默认安装目录由 installer-template.nsi 决定（目录页与落盘一致），此处仅清理旧版
  Call UninstallLegacyRhizome
!macroend

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

    ; 公司前缀目录在产品目录清空后一并移除（RmDir 仅删空目录）
    ${If} $INSTDIR == "$LOCALAPPDATA\${COMPANY_DIR_NAME}\${PRODUCT_DIR_NAME}"
      RmDir "$LOCALAPPDATA\${COMPANY_DIR_NAME}"
    ${EndIf}
  ${EndIf}
!macroend
