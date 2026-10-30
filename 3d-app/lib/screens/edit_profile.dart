import 'package:flutter/material.dart';

import '../api_client.dart';
import '../app_controller.dart';
import '../widgets/flow_ui.dart';
import '../widgets/ui.dart';

/// Profile › Edit profile (as the website's /profile/edit, client 2026-10-26):
/// the name, the email address and the password. A new email address or
/// password needs the current password (PATCH /auth/me checks it). Profile
/// shows the new name when this screen closes.
class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen(this.c, {super.key});
  final AppController c;

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  late final _name = TextEditingController(text: widget.c.user?.name ?? '');
  late final _email = TextEditingController(text: widget.c.user?.email ?? '');
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  final _current = TextEditingController();
  bool _busy = false;
  String? _error, _done;

  @override
  void initState() {
    super.initState();
    // The current-password field shows once the email or a new password changes.
    for (final t in [_name, _email, _password]) {
      t.addListener(() => setState(() {}));
    }
  }

  @override
  void dispose() {
    for (final t in [_name, _email, _password, _confirm, _current]) {
      t.dispose();
    }
    super.dispose();
  }

  ApiUser? get _user => widget.c.user;
  bool get _emailChanged =>
      _email.text.trim().toLowerCase() != (_user?.email ?? '').toLowerCase();
  bool get _needsCurrent => _emailChanged || _password.text.isNotEmpty;

  Future<void> _save() async {
    final c = widget.c;
    final user = _user;
    if (user == null) return;
    String? problem;
    if (_name.text.trim().isEmpty) {
      problem = 'Enter your name.';
    } else if (_email.text.trim().isEmpty) {
      problem = 'Enter your email address.';
    } else if (_password.text.isNotEmpty && _password.text.length < 8) {
      problem = 'Use at least 8 characters for the new password.';
    } else if (_password.text.isNotEmpty && _confirm.text != _password.text) {
      problem = 'The new passwords do not match.';
    } else if (_needsCurrent && _current.text.isEmpty) {
      problem =
          'Enter your current password to change your email address or password.';
    }
    if (problem != null) {
      setState(() {
        _error = problem;
        _done = null;
      });
      return;
    }
    final newPassword = _password.text.isNotEmpty;
    setState(() {
      _busy = true;
      _error = null;
      _done = null;
    });
    try {
      final next = await c.api.updateProfile(
        name: _name.text.trim(),
        email: _emailChanged ? _email.text.trim() : null,
        password: newPassword ? _password.text : null,
        passwordConfirmation: newPassword ? _confirm.text : null,
        currentPassword: _needsCurrent ? _current.text : null,
      );
      c.user = next;
      c.name = next.name;
      final token = c.api.token;
      if (token != null) {
        await c.session.saveAccount(token, next).catchError((Object _) {});
      }
      if (!mounted) return;
      _password.clear();
      _confirm.clear();
      _current.clear();
      _name.text = next.name;
      _email.text = next.email;
      setState(() {
        _busy = false;
        _done = newPassword
            ? 'Your profile is saved. Use your new password from now on; '
                  'your other devices were signed out.'
            : 'Your profile is saved.';
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = e.message;
      });
    }
  }

  Widget _label(String text) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Text(
      text,
      style: const TextStyle(fontSize: 12, color: Palette.muted),
    ),
  );

  Widget _field(
    String label,
    TextEditingController controller, {
    bool secret = false,
    TextInputType? keyboard,
    String? hint,
    List<String>? autofill,
    Key? key,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label(label),
        TextField(
          key: key,
          controller: controller,
          obscureText: secret,
          keyboardType: keyboard,
          autocorrect: false,
          enabled: !_busy,
          autofillHints: autofill,
          textInputAction: TextInputAction.next,
          decoration: InputDecoration(hintText: hint),
        ),
      ],
    ),
  );

  Widget _heading(IconData icon, String text) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Row(
      children: [
        Icon(icon, color: Palette.cyan, size: 20),
        const SizedBox(width: 9),
        Text(
          text,
          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
        ),
      ],
    ),
  );

  Widget _message(String text, {required bool good}) => Container(
    width: double.infinity,
    margin: const EdgeInsets.only(bottom: 16),
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: (good ? const Color(0xff3ddc97) : const Color(0xfff16482))
          .withValues(alpha: .08),
      border: Border.all(
        color: (good ? const Color(0xff3ddc97) : const Color(0xfff16482))
            .withValues(alpha: .35),
      ),
      borderRadius: BorderRadius.circular(8),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          good ? Icons.check_circle_outline : Icons.error_outline,
          size: 18,
          color: good ? const Color(0xff7ef0bd) : const Color(0xffffa3b3),
        ),
        const SizedBox(width: 9),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              fontSize: 12.5,
              height: 1.45,
              color: good ? const Color(0xff7ef0bd) : const Color(0xffffa3b3),
            ),
          ),
        ),
      ],
    ),
  );

  @override
  Widget build(BuildContext context) {
    final changed =
        _name.text.trim() != (_user?.name ?? '') ||
        _emailChanged ||
        _password.text.isNotEmpty;
    return Scaffold(
      backgroundColor: Palette.bg,
      body: SafeArea(
        child: Column(
          children: [
            TopBar(
              onBack: () => Navigator.of(context).maybePop(),
              title: 'Edit profile',
            ),
            Expanded(
              child: ListView(
                padding: EdgeInsets.fromLTRB(
                  22,
                  8,
                  22,
                  22 + MediaQuery.viewInsetsOf(context).bottom,
                ),
                children: [
                  if (_done != null) _message(_done!, good: true),
                  if (_error != null) _message(_error!, good: false),
                  _heading(Icons.person_outline_rounded, 'Your details'),
                  _field(
                    'Your name',
                    _name,
                    autofill: const [AutofillHints.name],
                    key: const ValueKey('edit-name'),
                  ),
                  _field(
                    'Email address',
                    _email,
                    keyboard: TextInputType.emailAddress,
                    autofill: const [AutofillHints.email],
                    key: const ValueKey('edit-email'),
                  ),
                  const SizedBox(height: 8),
                  _heading(Icons.key_outlined, 'Change password'),
                  const Padding(
                    padding: EdgeInsets.only(bottom: 12),
                    child: Text(
                      'Leave these empty to keep your password.',
                      style: TextStyle(fontSize: 11, color: Palette.muted),
                    ),
                  ),
                  _field(
                    'New password',
                    _password,
                    secret: true,
                    hint: 'At least 8 characters',
                    autofill: const [AutofillHints.newPassword],
                    key: const ValueKey('edit-password'),
                  ),
                  _field(
                    'Confirm new password',
                    _confirm,
                    secret: true,
                    hint: 'Type it again',
                    autofill: const [AutofillHints.newPassword],
                    key: const ValueKey('edit-confirm'),
                  ),
                  if (_needsCurrent)
                    SurfaceCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _field(
                            'Current password',
                            _current,
                            secret: true,
                            autofill: const [AutofillHints.password],
                            key: const ValueKey('edit-current'),
                          ),
                          const Text(
                            'Needed to change your email address or password.',
                            style: TextStyle(
                              fontSize: 11,
                              color: Palette.muted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  const SizedBox(height: 22),
                  GradientButton(
                    label: _busy ? 'Saving…' : 'Save changes',
                    icon: Icons.check_rounded,
                    onPressed: _busy || !changed ? null : _save,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
