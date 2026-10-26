import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app_controller.dart';
import '../widgets/flow_ui.dart';
import '../widgets/ui.dart';

/// "Forgot password?" on the sign-in sheet, as on the website: the email,
/// "Send code" (a 6-digit code by email that works for 15 minutes), then
/// "Sign in with the code" or "Set a new password". The server answers the
/// same for every address, so this never says whether an account exists.
class ForgotPasswordPanel extends StatefulWidget {
  const ForgotPasswordPanel(
    this.c, {
    super.key,
    this.email = '',
    required this.onBack,
    required this.onSignedIn,
  });
  final AppController c;
  final String email;
  final VoidCallback onBack, onSignedIn;

  @override
  State<ForgotPasswordPanel> createState() => _ForgotPasswordPanelState();
}

class _ForgotPasswordPanelState extends State<ForgotPasswordPanel> {
  late final _email = TextEditingController(text: widget.email.trim());
  final _code = TextEditingController();
  final _password = TextEditingController(), _confirm = TextEditingController();
  bool _codeStep = false, _newPassword = false, _busy = false;
  String? _sent, _error;
  int _wait = 0;
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    for (final t in [_email, _code, _password, _confirm]) {
      t.dispose();
    }
    super.dispose();
  }

  Future<void> _send() async {
    if (!widget.c.api.configured) {
      setState(() => _error = 'Set the 3DEEZI server address first.');
      return;
    }
    if (!_email.text.contains('@')) {
      setState(() => _error = 'Enter the email address of your account.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final (message, error) = await widget.c.sendLoginCode(_email.text);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = error;
      if (error == null) {
        _sent = message;
        _codeStep = true;
        _code.clear();
        _startWait();
      }
    });
  }

  void _startWait() {
    _timer?.cancel();
    _wait = 60;
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _wait--);
      if (_wait <= 0) t.cancel();
    });
  }

  Future<void> _finish() async {
    final code = _code.text.replaceAll(RegExp(r'\D'), '');
    if (code.length != 6) {
      setState(() => _error = 'Enter the 6-digit code from the email.');
      return;
    }
    if (_newPassword && _password.text.length < 8) {
      setState(() => _error = 'The new password needs at least 8 characters.');
      return;
    }
    if (_newPassword && _password.text != _confirm.text) {
      setState(() => _error = 'The new passwords do not match.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final c = widget.c;
    final error = _newPassword
        ? await c.resetPassword(
            email: _email.text,
            code: code,
            password: _password.text,
            passwordConfirmation: _confirm.text,
          )
        : await c.signInWithCode(email: _email.text, code: code);
    if (!mounted) return;
    if (error == null) {
      widget.onSignedIn();
    } else {
      setState(() {
        _busy = false;
        _error = error;
      });
    }
  }

  Widget _field(
    TextEditingController controller,
    String hint, {
    Key? key,
    bool secret = false,
    bool last = false,
    TextInputType? keyboard,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: TextField(
      key: key,
      controller: controller,
      obscureText: secret,
      keyboardType: keyboard,
      autocorrect: false,
      enabled: !_busy,
      textInputAction: last ? TextInputAction.done : TextInputAction.next,
      onSubmitted: last ? (_) => _codeStep ? _finish() : _send() : null,
      decoration: InputDecoration(hintText: hint),
    ),
  );

  Widget _choice(String label, IconData icon, bool password) {
    final on = _newPassword == password;
    return Expanded(
      child: Semantics(
        selected: on,
        button: true,
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: _busy
              ? null
              : () => setState(() {
                  _newPassword = password;
                  _error = null;
                }),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
            decoration: BoxDecoration(
              color: on ? Palette.cyan.withValues(alpha: .1) : Palette.bg,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                color: on ? Palette.cyan.withValues(alpha: .7) : Palette.border,
              ),
            ),
            child: Row(
              children: [
                Icon(icon, size: 16, color: on ? Palette.cyan : Palette.muted),
                const SizedBox(width: 7),
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: on ? Palette.text : Palette.muted,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final children = <Widget>[
      ScreenTitle(
        _codeStep ? 'Check your email' : 'Forgot your password?',
        size: 22,
      ),
      const SizedBox(height: 6),
      if (!_codeStep) ...[
        const Text(
          'Enter your email address. We will send you a 6-digit code to sign '
          'in or to set a new password.',
          style: TextStyle(color: Palette.muted, fontSize: 12, height: 1.4),
        ),
        const SizedBox(height: 16),
        _field(
          _email,
          'you@club.com',
          key: const Key('forgot-email'),
          keyboard: TextInputType.emailAddress,
          last: true,
        ),
      ] else ...[
        Container(
          padding: const EdgeInsets.all(11),
          decoration: BoxDecoration(
            color: Palette.cyan.withValues(alpha: .06),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Palette.cyan.withValues(alpha: .25)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(
                Icons.mark_email_read_outlined,
                size: 17,
                color: Palette.cyan,
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Text(
                  (_sent ?? '').replaceAll('6-digit', '6\u2011digit'),
                  style: const TextStyle(
                    color: Palette.text,
                    fontSize: 12,
                    height: 1.4,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: TextField(
            key: const Key('forgot-code'),
            controller: _code,
            enabled: !_busy,
            keyboardType: TextInputType.number,
            autofillHints: const [AutofillHints.oneTimeCode],
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(6),
            ],
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 22,
              letterSpacing: 8,
              fontWeight: FontWeight.w600,
            ),
            decoration: const InputDecoration(hintText: '6-digit code'),
            onSubmitted: (_) => _finish(),
          ),
        ),
        Row(
          children: [
            _choice('Sign in with the code', Icons.login_rounded, false),
            const SizedBox(width: 8),
            _choice('Set a new password', Icons.key_rounded, true),
          ],
        ),
        const SizedBox(height: 12),
        if (_newPassword) ...[
          _field(
            _password,
            'New password (8+ characters)',
            key: const Key('forgot-password'),
            secret: true,
          ),
          _field(
            _confirm,
            'Confirm new password',
            key: const Key('forgot-confirm'),
            secret: true,
            last: true,
          ),
        ],
      ],
      if (_error != null)
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Text(
            _error!,
            style: const TextStyle(color: Color(0xffff6b6b), fontSize: 12.5),
          ),
        ),
      const SizedBox(height: 4),
      _busy
          ? const SizedBox(
              height: 52,
              child: Center(child: CircularProgressIndicator()),
            )
          : GradientButton(
              label: !_codeStep
                  ? 'SEND CODE'
                  : _newPassword
                  ? 'SAVE AND SIGN IN'
                  : 'SIGN IN',
              onPressed: _codeStep ? _finish : _send,
            ),
      if (_codeStep) ...[
        const SizedBox(height: 6),
        TextButton(
          onPressed: _busy || _wait > 0 ? null : _send,
          child: Text(
            _wait > 0
                ? 'No email? Check spam, or send a new code in ${_wait}s'
                : 'No email? Send a new code',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: _wait > 0 ? Palette.muted : Palette.cyan,
              fontSize: 12,
            ),
          ),
        ),
        TextButton(
          onPressed: _busy
              ? null
              : () => setState(() {
                  _codeStep = false;
                  _error = null;
                }),
          child: const Text(
            'Change email',
            style: TextStyle(color: Palette.muted, fontSize: 12),
          ),
        ),
      ] else
        const SizedBox(height: 8),
      TextButton(
        onPressed: _busy ? null : widget.onBack,
        child: const Text(
          'Remembered it? Back to sign in',
          style: TextStyle(color: Palette.cyan, fontSize: 12.5),
        ),
      ),
    ];
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: children,
    );
  }
}
