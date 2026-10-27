; Uninstall removes what the app added by itself: its startup entry and the saved logins.
; Installing a new version runs the old uninstaller too; skip it then, or every update logs you out.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "True Brainrot"
    RMDir /r "$APPDATA\scroll-companion"
  ${endIf}
!macroend
