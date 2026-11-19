<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>Your 3DEEZI code</title>
</head>
<body style="margin:0;padding:0;background:#050b14;font-family:Arial,Helvetica,sans-serif;color:#edf3fa">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#050b14;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#0b1420;border:1px solid #1d3346;border-radius:14px">
<tr><td style="padding:28px 30px 8px">
<div style="font-size:26px;font-weight:800;font-style:italic;letter-spacing:.02em;color:#ffffff">3<span style="color:#00d9ed">DEEZI</span></div>
</td></tr>
<tr><td style="padding:14px 30px 0">
<h1 style="margin:0 0 12px;font-size:21px;line-height:1.3;color:#ffffff">Your sign-in code</h1>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#a9bccd">Hi{{ $name !== '' ? ' '.$name : '' }}, enter this code in the 3DEEZI sign-in window to sign in, or to set a new password.</p>
</td></tr>
<tr><td align="center" style="padding:0 30px">
<div style="display:inline-block;padding:16px 26px;border-radius:10px;background:#071d2a;border:1px solid #00d9ed55;font-size:34px;font-weight:700;letter-spacing:10px;color:#00d9ed;font-family:'Courier New',Courier,monospace">{{ $code }}</div>
</td></tr>
<tr><td style="padding:20px 30px 28px">
<p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#a9bccd">It works for {{ $minutes }} minutes. Only the newest code works.</p>
<p style="margin:0;font-size:12px;line-height:1.6;color:#6f8799">If you did not ask for this code, you can ignore this email. Your password has not changed.</p>
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:11px;color:#4f6578">3DEEZI · Dream it. Design it. Wear it.</p>
</td></tr>
</table>
</body>
</html>
