# Share a posting to Jobify from your phone

You see a role in the LinkedIn app, hit **Share**, and it is in Jobify. The server does the
reading, so your phone only has to hand over the link.

Everything here is also on **Settings → Account → Add jobs from your phone**, with your own
server's address filled in and a button to create the token.

## Install Jobify on the home screen

Open Jobify in Safari (or Chrome on Android) and choose **Add to Home Screen**. It then opens
without browser chrome, with its own icon.

> Installing and the service worker need HTTPS. Over plain `http://` on a LAN address the app
> works, but it will not install. A reverse proxy with a certificate is the usual answer.

## Android: nothing to set up

Android honours the app's `share_target`, so once Jobify is installed it appears in the share
sheet by itself. Sharing a link opens Jobify's **Add job** page with the posting imported and
the form ready to save.

## iOS: a shortcut

Safari does not support the Web Share Target API — an installed web app **cannot** appear in the
iOS share sheet, and no setting changes that ([WebKit bug
194593](https://bugs.webkit.org/show_bug.cgi?id=194593), open since 2019). What can appear there
is a shortcut, so that is what Jobify uses.

Pick one of the two. The first takes a minute to set up and shows you the posting before it is
saved; the second saves it without leaving the app you are in.

### Option 1: open Jobify with the posting

1. In **Shortcuts**, make a new shortcut and add **Open URLs**.
2. Set the URL to your Jobify address followed by `/jobs/new?url=`, then insert **Shortcut
   Input** at the end, e.g.
   `https://jobify.example.com/jobs/new?url=` + `Shortcut Input`.
3. Open the shortcut's details (ⓘ), turn on **Show in Share Sheet**, and set **Accept** to URLs
   and text.
4. Name it _Add to Jobify_.

Sharing a posting now opens Jobify, imports it, and leaves the form filled in for you to save.
A posting Jobify cannot read — one behind a login wall, say — still arrives with its link in the
form, so nothing is lost.

### Option 2: save it without opening Jobify

This one needs an access token, because a shortcut has no browser session.

1. In Jobify, go to **Settings → Account → Add jobs from your phone** and create a token. It is
   shown once; copy it.
2. In **Shortcuts**, make a new shortcut and add **Get contents of URL**.
3. Set the URL to your Jobify address followed by `/api/share`, and **Method** to `POST`.
4. Under **Headers**, add `Authorization` with the value `Bearer ` followed by your token.
5. Under **Request Body**, choose **JSON** and add one text field named `url`, set to **Shortcut
   Input**.
6. Add **Show notification** and set its body to the `message` from the response (tap the
   response variable and pick **message**).
7. In the shortcut's details (ⓘ), turn on **Show in Share Sheet** and accept URLs and text.

Sharing a posting now shows a notification — _Saved: Senior Engineer at Acme_ — and the job is in
your active hunt at status **Saved**.

The response also has `id`, `title`, `company`, `url`, `duplicate` and `warnings`, if you want to
build something more elaborate (open the job, add a tag, send yourself the link).

## What gets saved

- The posting is imported exactly as **Add job** would import it, with the same site parsers, so
  a LinkedIn link arrives with its title, company, location and description. Short links such as
  `lnkd.in` are followed.
- If an AI provider is set up, it fills in what the parsers missed.
- A posting that cannot be read at all is **still saved**, with its link and whatever the sharing
  app called it, and `warnings` says why. Tidy it up later at a real keyboard.
- A posting you already have is not saved twice: the response says `duplicate` and points at the
  job you already had.

## Tokens

A token can do everything your account can, so treat it like a password: one per device, and
revoke it on **Settings → Account** if that device goes missing. Jobify stores only a hash of
it, which is why it can only be shown once.
