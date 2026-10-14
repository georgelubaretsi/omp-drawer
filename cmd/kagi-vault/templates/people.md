---
service: Kagi
credential: Session Link
usage: |-
  kagi-vault: the piebird-kagi-search plugin's vault, which keeps your Kagi session and talks to Kagi.

  usage: kagi-vault sign-in [--link]          (--link: paste the Session Link when asked)
         kagi-vault sign-out
         kagi-vault status
         kagi-vault call <operation>   (for the plugin: the input as JSON on stdin)
sign-in-page: "{{if .Opened}}Sign in on the page that opened in your browser ({{.URL}}).{{else}}Open {{.URL}} in a browser on this computer to sign in.{{end}}"
signed-in: "Signed in to Kagi; the session is kept in {{.From}}."
signed-out: "Signed out: the kept Kagi session is gone."
paste-link: "Paste your Kagi Session Link and press Enter: "
status:
  none: "Not signed in to Kagi: no session is kept."
  signed-in: "Signed in to Kagi; the session comes from {{.From}}."
  refused: "Kagi refuses the session from {{.From}} ({{.Problem}}): sign in again."
fail: "kagi-vault: {{.Cause}}"
errors:
  not-kagi-link: That isn't a Kagi link; copy the Session Link from Kagi's settings.
  not-session-link: That doesn't look like a Session Link; copy the whole link from Kagi's settings.
  link-refused: Kagi doesn't accept that Session Link; copy it again from Kagi's settings.
  signed-out: Kagi no longer accepts the session.
  no-session: No Kagi session is kept on this computer.
  cannot-reach: "Kagi can't be reached: {{.cause}}"
  secret-store: "The session couldn't be kept: {{.cause}}"
  other: "{{.Error}}"
---
