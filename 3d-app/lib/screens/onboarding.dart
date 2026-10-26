import 'dart:async';

import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../widgets/flow_ui.dart';
import '../widgets/ui.dart';
import 'forgot_password.dart';

/// 1 · Splash: brand mark, wordmark and a loading bar.
class SplashScreen extends StatefulWidget {
  const SplashScreen(this.c, {super.key});
  final AppController c;
  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _load = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1900),
  )..forward();
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer(const Duration(milliseconds: 2100), _next);
  }

  void _next() {
    if (mounted && widget.c.screen == AppScreen.splash) {
      widget.c.go(widget.c.signedIn ? AppScreen.home : AppScreen.onboarding);
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _load.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: _next,
    child: Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        gradient: RadialGradient(
          center: Alignment(0, -.25),
          radius: .9,
          colors: [Color(0xff07304a), Color(0xff040a10), Palette.bg],
        ),
      ),
      child: Column(
        children: [
          const Spacer(flex: 4),
          ScaleTransition(
            scale: CurvedAnimation(
              parent: _load,
              curve: Curves.easeOutBack,
            ).drive(Tween(begin: .82, end: 1)),
            child: Image.asset(
              'assets/images/logo_full.png',
              width: 280,
              filterQuality: FilterQuality.high,
            ),
          ),
          const Spacer(flex: 5),
          const Text(
            'YOUR SPORT\nYOUR WAY.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Palette.muted,
              letterSpacing: 3.4,
              fontSize: 11,
              height: 1.9,
            ),
          ),
          const SizedBox(height: 22),
          SizedBox(
            width: 150,
            child: AnimatedBuilder(
              animation: _load,
              builder: (context, _) => ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: Curves.easeInOut.transform(_load.value),
                  minHeight: 4,
                  backgroundColor: Palette.surface2,
                  color: Palette.cyan,
                ),
              ),
            ),
          ),
          const SizedBox(height: 46),
        ],
      ),
    ),
  );
}

/// 2 · Onboarding: hero kit, headline and "Get started".
class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen(this.c, {super.key});
  final AppController c;

  @override
  Widget build(BuildContext context) => Stack(
    fit: StackFit.expand,
    children: [
      artImage(
        asset: 'assets/images/art/onboarding.jpg',
        alignment: const Alignment(0, -.4),
      ),
      const DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0x0005090d), Color(0x0005090d), Palette.bg],
            stops: [0, .45, .72],
          ),
        ),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(26, 0, 26, 30),
        child: Column(
          children: [
            const SizedBox(height: 18),
            const BrandLogo(width: 150),
            const Spacer(),
            const ScreenTitle('Custom sportswear\nyour way', size: 31),
            const SizedBox(height: 12),
            const Text(
              'Design, customise and bring your vision to life with the '
              'power of AI and 3D.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Palette.muted, fontSize: 13, height: 1.6),
            ),
            const SizedBox(height: 18),
            const PageDots(count: 3, index: 0),
            const SizedBox(height: 22),
            GradientButton(
              label: 'GET STARTED',
              icon: Icons.arrow_forward_rounded,
              onPressed: () => c.go(AppScreen.auth),
            ),
          ],
        ),
      ),
    ],
  );
}

/// 3 · Sign up / sign in. Demo accounts: every option enters the app.
class AuthScreen extends StatelessWidget {
  const AuthScreen(this.c, {super.key});
  final AppController c;

  Future<void> _account(BuildContext context, {bool register = true}) async {
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      // With the keyboard up the form fills the screen: keep it below the
      // iPhone notch and give it a ✕.
      useSafeArea: true,
      backgroundColor: Palette.surface,
      builder: (_) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SheetTop(),
          Flexible(child: AccountSheet(c, register: register)),
        ],
      ),
    );
    if (ok == true && context.mounted) {
      showToast(context, 'Signed in as ${c.user?.email}. Projects now sync.');
      c.go(AppScreen.home);
    }
  }

  void _social(BuildContext context, String how) {
    showToast(
      context,
      '$how sign-in arrives with the store release. Use email.',
    );
    _account(context);
  }

  @override
  Widget build(BuildContext context) => Container(
    decoration: const BoxDecoration(
      gradient: RadialGradient(
        center: Alignment(0, -.5),
        radius: 1,
        colors: [Color(0xff062638), Palette.bg],
      ),
    ),
    padding: const EdgeInsets.symmetric(horizontal: 26),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Spacer(flex: 3),
        const Center(child: BrandLogo(width: 220, tagline: true)),
        const SizedBox(height: 34),
        const Text(
          'Welcome to 3DEEZI',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 21, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        const Text(
          'Create custom sportswear\nwith AI and 3D.',
          textAlign: TextAlign.center,
          style: TextStyle(color: Palette.muted, fontSize: 13, height: 1.5),
        ),
        const Spacer(flex: 2),
        _SignInButton(
          icon: Icons.apple,
          label: 'Continue with Apple',
          onTap: () => _social(context, 'Apple'),
        ),
        const SizedBox(height: 12),
        _SignInButton(
          google: true,
          label: 'Continue with Google',
          onTap: () => _social(context, 'Google'),
        ),
        const SizedBox(height: 12),
        _SignInButton(
          icon: Icons.mail_outline_rounded,
          label: 'Continue with Email',
          outlined: true,
          onTap: () => _account(context),
        ),
        const SizedBox(height: 22),
        const Row(
          children: [
            Expanded(child: Divider()),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: 12),
              child: Text(
                'OR',
                style: TextStyle(color: Palette.muted, fontSize: 11),
              ),
            ),
            Expanded(child: Divider()),
          ],
        ),
        const SizedBox(height: 14),
        Center(
          child: Text.rich(
            TextSpan(
              text: 'Already have an account? ',
              style: const TextStyle(color: Palette.muted, fontSize: 12.5),
              children: [
                WidgetSpan(
                  alignment: PlaceholderAlignment.middle,
                  child: GestureDetector(
                    onTap: () => _account(context, register: false),
                    child: const Text(
                      'Sign In',
                      style: TextStyle(
                        color: Palette.cyan,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 6),
        Center(
          child: TextButton(
            onPressed: () => c.go(AppScreen.home),
            child: const Text(
              'Continue as guest (projects stay on this device)',
              style: TextStyle(color: Palette.muted, fontSize: 11.5),
            ),
          ),
        ),
        const Spacer(flex: 2),
      ],
    ),
  );
}

/// Register or sign in to the 3DEEZI server (the website's database).
class AccountSheet extends StatefulWidget {
  const AccountSheet(this.c, {super.key, this.register = true});
  final AppController c;
  final bool register;

  @override
  State<AccountSheet> createState() => _AccountSheetState();
}

class _AccountSheetState extends State<AccountSheet> {
  late bool _register = widget.register;

  /// "Forgot password?": the code flow shows in place of the form.
  bool _forgot = false;
  final _name = TextEditingController(), _email = TextEditingController();
  final _password = TextEditingController(), _confirm = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final t in [_name, _email, _password, _confirm]) {
      t.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    final c = widget.c;
    if (!c.api.configured) {
      setState(() => _error = 'Set the 3DEEZI server address first.');
      return;
    }
    if (_register && _password.text != _confirm.text) {
      setState(() => _error = 'The passwords do not match.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = _register
        ? await c.register(
            name: _name.text,
            email: _email.text,
            password: _password.text,
            passwordConfirmation: _confirm.text,
          )
        : await c.signIn(email: _email.text, password: _password.text);
    if (!mounted) return;
    if (error == null) {
      Navigator.pop(context, true);
    } else {
      setState(() {
        _busy = false;
        _error = error;
      });
    }
  }

  Future<void> _server() async {
    final url = await editServer(context, widget.c);
    if (url != null && mounted) setState(() => _error = null);
  }

  Widget _field(
    TextEditingController controller,
    String hint, {
    bool secret = false,
    TextInputType? keyboard,
    bool last = false,
  }) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: TextField(
      controller: controller,
      obscureText: secret,
      keyboardType: keyboard,
      autocorrect: false,
      enabled: !_busy,
      textInputAction: last ? TextInputAction.done : TextInputAction.next,
      onSubmitted: last ? (_) => _submit() : null,
      decoration: InputDecoration(hintText: hint),
    ),
  );

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(
      22,
      0,
      22,
      22 + MediaQuery.viewInsetsOf(context).bottom,
    ),
    child: SingleChildScrollView(
      child: _forgot
          ? ForgotPasswordPanel(
              widget.c,
              email: _email.text,
              onBack: () => setState(() {
                _forgot = false;
                _error = null;
              }),
              onSignedIn: () => Navigator.pop(context, true),
            )
          : Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                ScreenTitle(
                  _register ? 'Create your account' : 'Sign in',
                  size: 22,
                ),
                const SizedBox(height: 6),
                const Text(
                  'Your projects save to your 3DEEZI account and open on the website too.',
                  style: TextStyle(
                    color: Palette.muted,
                    fontSize: 12,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 16),
                if (_register) _field(_name, 'Full name'),
                _field(
                  _email,
                  'you@club.com',
                  keyboard: TextInputType.emailAddress,
                ),
                _field(
                  _password,
                  _register ? 'Password (8+ characters)' : 'Password',
                  secret: true,
                  last: !_register,
                ),
                if (_register)
                  _field(
                    _confirm,
                    'Confirm password',
                    secret: true,
                    last: true,
                  ),
                if (!_register)
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: _busy
                          ? null
                          : () => setState(() {
                              _forgot = true;
                              _error = null;
                            }),
                      child: const Text(
                        'Forgot password?',
                        style: TextStyle(color: Palette.cyan, fontSize: 12.5),
                      ),
                    ),
                  ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Text(
                      _error!,
                      style: const TextStyle(
                        color: Color(0xffff6b6b),
                        fontSize: 12.5,
                      ),
                    ),
                  ),
                const SizedBox(height: 4),
                _busy
                    ? const SizedBox(
                        height: 52,
                        child: Center(child: CircularProgressIndicator()),
                      )
                    : GradientButton(
                        label: _register ? 'CREATE ACCOUNT' : 'SIGN IN',
                        onPressed: _submit,
                      ),
                const SizedBox(height: 8),
                TextButton(
                  onPressed: _busy
                      ? null
                      : () => setState(() {
                          _register = !_register;
                          _error = null;
                        }),
                  child: Text(
                    _register
                        ? 'Already have an account? Sign in'
                        : 'New to 3DEEZI? Create an account',
                    style: const TextStyle(color: Palette.cyan, fontSize: 12.5),
                  ),
                ),
                TextButton.icon(
                  onPressed: _busy ? null : _server,
                  icon: const Icon(
                    Icons.dns_outlined,
                    size: 15,
                    color: Palette.muted,
                  ),
                  label: Text(
                    'Server: ${widget.c.api.host}',
                    style: const TextStyle(
                      color: Palette.muted,
                      fontSize: 11.5,
                    ),
                  ),
                ),
              ],
            ),
    ),
  );
}

/// Asks for the 3DEEZI server address; returns it once saved.
Future<String?> editServer(BuildContext context, AppController c) async {
  final field = TextEditingController(text: c.api.baseUrl);
  final url = await showDialog<String>(
    context: context,
    builder: (dialog) => AlertDialog(
      backgroundColor: Palette.surface,
      title: const Text('3DEEZI server'),
      content: TextField(
        controller: field,
        autofocus: true,
        keyboardType: TextInputType.url,
        autocorrect: false,
        decoration: const InputDecoration(hintText: 'https://test.example.com'),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialog),
          child: const Text('Cancel'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(dialog, field.text),
          child: const Text('Save'),
        ),
      ],
    ),
  );
  field.dispose();
  if (url == null || url.trim().isEmpty) return null;
  await c.setServer(url);
  return c.api.baseUrl;
}

class _SignInButton extends StatelessWidget {
  const _SignInButton({
    required this.label,
    required this.onTap,
    this.icon,
    this.google = false,
    this.outlined = false,
  });
  final String label;
  final VoidCallback onTap;
  final IconData? icon;
  final bool google, outlined;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: 52,
    child: Material(
      color: outlined ? Colors.transparent : Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(13),
        side: outlined
            ? const BorderSide(color: Palette.cyan, width: 1.3)
            : BorderSide.none,
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(13),
        onTap: onTap,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (google)
              const Text(
                'G',
                style: TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                  color: Color(0xff4285f4),
                ),
              )
            else
              Icon(
                icon,
                size: 21,
                color: outlined ? Palette.cyan : Colors.black,
              ),
            const SizedBox(width: 12),
            Text(
              label,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: outlined ? Palette.text : Colors.black,
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
