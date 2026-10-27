; Uninstall removes what the app added by itself: its startup entry, the saved logins and the
; truebrainrot:// link type early builds registered for a sign-in link (sign-in is a code now).
; Installing a new version runs the old uninstaller too; skip it then, or every update logs you out.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "True Brainrot"
    RMDir /r "$APPDATA\scroll-companion"
    DeleteRegKey HKCU "Software\Classes\truebrainrot"
  ${endIf}
!macroend
