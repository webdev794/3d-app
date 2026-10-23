import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api_client.dart';
import '../app_controller.dart';
import '../order_names.dart';
import '../widgets/flow_ui.dart';
import '../widgets/ui.dart';

// Plans, Corporate Partner, ordering kits and order tracking: the same
// offer and server endpoints as the website (/pricing, /orders).

const _purple = Color(0xff8b5cf6);

class _Plan {
  const _Plan(
    this.name,
    this.tag,
    this.monthly,
    this.yearly,
    this.credits,
    this.features, {
    required this.team,
    this.popular = false,
  });
  final String name, tag;

  /// A$ a month: whole dollars, or with cents (Club A$49.95).
  final num monthly;

  /// A$ a year (2 months free): Club A$499.50.
  final num yearly;
  final int credits;
  final List<String> features;

  /// The plan's 3DEEZI TEAM (real designers) line, as on the website's
  /// /pricing and the server's TEAM plans (2026-10-22).
  final String team;
  final bool popular;
}

const _plans = [
  _Plan('Rookie', 'Try it free', 0, 0, 20, [
    'Unlimited 3D design studio',
    '3 saved projects',
    '20 AI credits each month',
    'Standard-resolution exports',
    '3DEEZI watermark on AI images',
  ], team: '3DEEZI TEAM designer: A\$100 per design (incl. GST)'),
  _Plan('Creator', 'For designers & coaches', 19, 190, 250, [
    'Everything in Rookie',
    '250 AI credits each month',
    'Unlimited projects & versions',
    'HD exports, no watermark',
    'Convert any image to 3D',
  ], team: '3DEEZI TEAM designer: A\$49.95 per design (incl. GST)'),
  _Plan(
    'Club',
    'For clubs & schools',
    49.95,
    499.5,
    900,
    [
      'Everything in Creator',
      '900 AI credits each month',
      '5 team seats',
      'Shared logo & asset library',
      'Approval workflow for committees',
      'Priority generation',
    ],
    team: '3DEEZI TEAM designers included: 15 designs a month',
    popular: true,
  ),
  _Plan('Pro Studio', 'For brands & resellers', 149, 1490, 3000, [
    'Everything in Club',
    '3,000 AI credits each month',
    '15 team seats',
    'Brand kit & commercial licence',
    'Custom branding on mockups',
    'Dedicated support',
  ], team: '3DEEZI TEAM designers included: 30 designs a month'),
];
const _costs = [
  ('AI edit in the studio (“Ask 3DEEZI”)', 1),
  ('Convert an image to 3D', 1),
  ('Four AI designs', 2),
  ('AI print pattern', 3),
  ('Photoreal showcase image', 5),
  ('Make HD (an HD front and back presentation)', 10),
  ('Make it 3D (AI print sheet on the 3D kit)', 10),
];
const _perks = [
  'Website integration',
  'Your branding & garments',
  'Team-led onboarding',
  'Training & setup',
  'Annual AI credit allowance',
  'Priority partner support',
];
const _steps = [
  ('Apply', Icons.assignment_outlined),
  ('Consultation', Icons.forum_outlined),
  ('Onboarding', Icons.handshake_outlined),
  ('Launch', Icons.rocket_launch_outlined),
];

const _eyebrow = TextStyle(
  color: Palette.cyan,
  fontSize: 10.5,
  letterSpacing: 2.4,
  fontWeight: FontWeight.w700,
);
const _heading = TextStyle(
  fontFamily: 'Rajdhani',
  fontWeight: FontWeight.w700,
  fontSize: 24,
  height: 1.05,
);

/// Plans & pricing, with the Corporate Partner plan (as on the website).
class PricingScreen extends StatefulWidget {
  const PricingScreen(this.c, {super.key});
  final AppController c;
  @override
  State<PricingScreen> createState() => _PricingScreenState();
}

class _PricingScreenState extends State<PricingScreen> {
  bool _yearly = false;

  @override
  Widget build(BuildContext context) {
    final c = widget.c;
    return Column(
      children: [
        TopBar(onBack: c.back, title: 'Plans & pricing'),
        Expanded(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(18, 6, 18, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'PROPOSED PLANS · FOR DISCUSSION',
                  style: _eyebrow,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                const ScreenTitle(
                  'Design more. ',
                  highlight: 'Pay for what you use.',
                  size: 25,
                ),
                const SizedBox(height: 8),
                const Text(
                  'The 3D studio is unlimited on every plan. Credits are only used when AI creates something.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Palette.muted,
                    fontSize: 12.5,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 14),
                Center(
                  child: SegmentedButton<bool>(
                    segments: const [
                      ButtonSegment(value: false, label: Text('Monthly')),
                      ButtonSegment(
                        value: true,
                        label: Text('Yearly · 2 months free'),
                      ),
                    ],
                    selected: {_yearly},
                    showSelectedIcon: false,
                    onSelectionChanged: (v) =>
                        setState(() => _yearly = v.first),
                  ),
                ),
                const SizedBox(height: 16),
                for (final p in _plans) ...[
                  _PlanCard(p, yearly: _yearly, onStart: c.startDyo),
                  const SizedBox(height: 14),
                ],
                _PartnerCard(onApply: () => showPartnerSheet(context, c)),
                const SizedBox(height: 14),
                SurfaceCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('WHAT A CREDIT BUYS', style: _eyebrow),
                      const SizedBox(height: 6),
                      const Text(
                        'Simple, predictable AI costs.',
                        style: _heading,
                      ),
                      const SizedBox(height: 10),
                      for (final (label, n) in _costs)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 7),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  label,
                                  style: const TextStyle(fontSize: 12.5),
                                ),
                              ),
                              Text(
                                '$n credit${n > 1 ? 's' : ''}',
                                style: const TextStyle(
                                  color: Palette.cyan,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                      const SizedBox(height: 6),
                      const Text(
                        'Extra credits: 100 for A\$9 or 500 for A\$39, and they never expire. Prices include GST.',
                        style: TextStyle(
                          color: Palette.muted,
                          fontSize: 11.5,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'This is a proposed structure for review. Prices, credit amounts and features can be adjusted before payments go live.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Palette.muted, fontSize: 11),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard(this.p, {required this.yearly, required this.onStart});
  final _Plan p;
  final bool yearly;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    final price = p.monthly == 0
        ? 'Free'
        : 'A\$${yearly ? _perMonth(p) : _dollars(p.monthly)}';
    return GlowCard(
      selected: p.popular,
      radius: 14,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(p.name, style: _heading)),
                if (p.popular)
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(20),
                      gradient: const LinearGradient(
                        colors: [Palette.cyan, Palette.blue],
                      ),
                    ),
                    child: const Text(
                      'MOST POPULAR',
                      style: TextStyle(
                        color: Color(0xff02131c),
                        fontSize: 9.5,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1,
                      ),
                    ),
                  ),
              ],
            ),
            Text(
              p.tag,
              style: const TextStyle(color: Palette.muted, fontSize: 12),
            ),
            const SizedBox(height: 10),
            Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: price,
                    style: const TextStyle(
                      fontFamily: 'Rajdhani',
                      fontSize: 32,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (p.monthly > 0)
                    TextSpan(
                      text: yearly
                          ? ' / month, A\$${_dollars(p.yearly)} billed yearly'
                          : ' / month',
                      style: const TextStyle(
                        color: Palette.muted,
                        fontSize: 12,
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                const Icon(Icons.auto_awesome, size: 15, color: Palette.cyan),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    '${_n(p.credits)} AI credits / month',
                    style: const TextStyle(
                      color: Palette.cyan,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            for (final f in p.features) _Check(f),
            _Check(
              p.team,
              key: Key('plan-team-${p.name}'),
              icon: Icons.groups_outlined,
            ),
            const SizedBox(height: 10),
            p.popular
                ? GradientButton(
                    label: p.monthly > 0
                        ? 'START 7-DAY FREE TRIAL'
                        : 'START DESIGNING',
                    compact: true,
                    onPressed: onStart,
                  )
                : SecondaryButton(
                    label: p.monthly > 0
                        ? 'Start 7-day free trial'
                        : 'Start designing',
                    onPressed: onStart,
                  ),
          ],
        ),
      ),
    );
  }
}

String _n(int v) =>
    v >= 1000 ? '${v ~/ 1000},${(v % 1000).toString().padLeft(3, '0')}' : '$v';

/// The yearly price a month: whole dollars (16) unless the plan is priced in
/// cents (Club: 499.50 / 12 = 41.63), as on the website.
String _perMonth(_Plan p) => p.monthly == p.monthly.roundToDouble()
    ? '${(p.yearly / 12).round()}'
    : ((p.yearly / 12 * 100).round() / 100).toStringAsFixed(2);

/// 19 stays whole; a price with cents shows them (49.95, 499.50).
String _dollars(num v) =>
    v == v.roundToDouble() ? '${v.round()}' : v.toStringAsFixed(2);

class _Check extends StatelessWidget {
  const _Check(this.text, {super.key, this.icon = Icons.check_rounded});
  final String text;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: 1),
          child: Icon(icon, size: 16, color: Palette.cyan),
        ),
        const SizedBox(width: 8),
        Expanded(child: Text(text, style: const TextStyle(fontSize: 12.5))),
      ],
    ),
  );
}

/// Corporate Partner: a glowing purple-cyan card, as on the website.
class _PartnerCard extends StatelessWidget {
  const _PartnerCard({required this.onApply});
  final VoidCallback onApply;

  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(16),
      gradient: const LinearGradient(
        colors: [Palette.cyan, _purple, Palette.cyan],
        stops: [0, .55, 1],
      ),
      boxShadow: [
        BoxShadow(
          color: _purple.withValues(alpha: .35),
          blurRadius: 26,
          spreadRadius: -2,
        ),
        BoxShadow(
          color: Palette.cyan.withValues(alpha: .2),
          blurRadius: 18,
          spreadRadius: -2,
        ),
      ],
    ),
    padding: const EdgeInsets.all(1.6),
    child: Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14.5),
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xff0a1222), Color(0xff060c17)],
        ),
      ),
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 4),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              color: _purple.withValues(alpha: .15),
              border: Border.all(color: _purple.withValues(alpha: .7)),
            ),
            child: const Text(
              'YEARLY ONLY',
              style: TextStyle(
                color: Color(0xffc4b5fd),
                fontSize: 10,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.6,
              ),
            ),
          ),
          const SizedBox(height: 10),
          const Text.rich(
            TextSpan(
              children: [
                TextSpan(text: 'Corporate '),
                TextSpan(
                  text: 'Partner',
                  style: TextStyle(color: Palette.cyan),
                ),
              ],
            ),
            style: TextStyle(
              fontFamily: 'Rajdhani',
              fontSize: 30,
              fontWeight: FontWeight.w700,
              height: 1,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Bring 3DEEZI to your website.',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 3),
          const Text(
            'For sportswear companies ready to offer their own online design studio.',
            style: TextStyle(color: Palette.muted, fontSize: 12.5),
          ),
          const SizedBox(height: 12),
          const Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: 'From ',
                  style: TextStyle(fontSize: 14, color: Color(0xffcbd5e1)),
                ),
                TextSpan(
                  text: 'A\$5,990',
                  style: TextStyle(
                    fontFamily: 'Rajdhani',
                    fontSize: 30,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                TextSpan(
                  text: '/year',
                  style: TextStyle(fontSize: 14, color: Color(0xffcbd5e1)),
                ),
              ],
            ),
          ),
          const Text(
            'Yearly only. Setup fee applies. Pricing excludes GST.',
            style: TextStyle(color: Palette.muted, fontSize: 11.5),
          ),
          const SizedBox(height: 10),
          for (final p in _perks) _Check(p),
          const SizedBox(height: 14),
          Row(
            children: [
              for (final (i, (label, ic)) in _steps.indexed) ...[
                Expanded(
                  child: Column(
                    children: [
                      Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: (i.isOdd ? _purple : Palette.cyan).withValues(
                            alpha: .12,
                          ),
                          border: Border.all(
                            color: (i.isOdd ? _purple : Palette.cyan)
                                .withValues(alpha: .7),
                            width: 1.4,
                          ),
                        ),
                        child: Icon(
                          ic,
                          size: 18,
                          color: i.isOdd
                              ? const Color(0xffc4b5fd)
                              : Palette.cyan,
                        ),
                      ),
                      const SizedBox(height: 5),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(
                          label,
                          style: const TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                if (i < _steps.length - 1)
                  const Icon(
                    Icons.arrow_forward,
                    size: 13,
                    color: Palette.muted,
                  ),
              ],
            ],
          ),
          const SizedBox(height: 16),
          GradientButton(
            label: 'APPLY TO BECOME A PARTNER',
            icon: Icons.arrow_forward_rounded,
            compact: true,
            onPressed: onApply,
          ),
        ],
      ),
    ),
  );
}

// -------------------------------------------------------------------
// Bottom-sheet forms
// -------------------------------------------------------------------
Future<T?> _sheet<T>(BuildContext context, Widget child) =>
    showModalBottomSheet<T>(
      context: context,
      isScrollControlled: true,
      // Below the iPhone notch, with a ✕: a long form fills the screen.
      useSafeArea: true,
      backgroundColor: Palette.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheet) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(sheet).bottom),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SheetTop(),
              Flexible(child: child),
            ],
          ),
        ),
      ),
    );

InputDecoration _field(String label, {String? hint}) => InputDecoration(
  labelText: label,
  hintText: hint,
  isDense: true,
  border: const OutlineInputBorder(),
);

/// "Apply to become a partner" form (POST /partners/apply).
Future<void> showPartnerSheet(BuildContext context, AppController c) =>
    _sheet(context, _PartnerForm(c));

class _PartnerForm extends StatefulWidget {
  const _PartnerForm(this.c);
  final AppController c;
  @override
  State<_PartnerForm> createState() => _PartnerFormState();
}

class _PartnerFormState extends State<_PartnerForm> {
  final _form = GlobalKey<FormState>();
  late final _fields = {
    for (final k in ['company', 'website', 'name', 'phone', 'email', 'message'])
      k: TextEditingController(),
  };
  bool _busy = false;
  String? _error, _done;

  @override
  void initState() {
    super.initState();
    if (widget.c.signedIn) {
      _fields['name']!.text = widget.c.user!.name;
      _fields['email']!.text = widget.c.user!.email;
    }
  }

  @override
  void dispose() {
    for (final t in _fields.values) {
      t.dispose();
    }
    super.dispose();
  }

  Future<void> _send() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final reply = await widget.c.api.applyPartner({
        for (final e in _fields.entries) e.key: e.value.text.trim(),
      });
      if (mounted) setState(() => _done = reply);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
    child: Form(
      key: _form,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('CORPORATE PARTNER', style: _eyebrow),
          const SizedBox(height: 4),
          const Text('Apply to become a partner', style: _heading),
          const SizedBox(height: 8),
          if (_done != null) ...[
            Row(
              children: [
                const Icon(Icons.check_circle_outline, color: Palette.cyan),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(_done!, style: const TextStyle(fontSize: 13)),
                ),
              ],
            ),
            const SizedBox(height: 16),
            GradientButton(
              label: 'CLOSE',
              compact: true,
              onPressed: () => Navigator.pop(context),
            ),
          ] else ...[
            const Text(
              'Tell us about your company. We’ll book a consultation to plan your branded 3DEEZI studio.',
              style: TextStyle(color: Palette.muted, fontSize: 12.5),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _fields['company'],
              decoration: _field('Company'),
              maxLength: 160,
              validator: _required,
            ),
            TextFormField(
              controller: _fields['website'],
              decoration: _field('Website', hint: 'yoursport.com'),
              maxLength: 255,
              keyboardType: TextInputType.url,
            ),
            TextFormField(
              controller: _fields['name'],
              decoration: _field('Your name'),
              maxLength: 120,
              validator: _required,
            ),
            TextFormField(
              controller: _fields['phone'],
              decoration: _field('Phone'),
              maxLength: 40,
              keyboardType: TextInputType.phone,
            ),
            TextFormField(
              controller: _fields['email'],
              decoration: _field('Email'),
              maxLength: 190,
              keyboardType: TextInputType.emailAddress,
              validator: _email,
            ),
            TextFormField(
              controller: _fields['message'],
              decoration: _field(
                'What would you like to offer?',
                hint: 'Sports, garments, expected customers, launch date',
              ),
              maxLength: 3000,
              minLines: 2,
              maxLines: 4,
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  _error!,
                  style: const TextStyle(
                    color: Color(0xffff6b78),
                    fontSize: 12.5,
                  ),
                ),
              ),
            GradientButton(
              label: _busy ? 'SENDING…' : 'SEND APPLICATION',
              compact: true,
              onPressed: _busy ? null : _send,
            ),
          ],
        ],
      ),
    ),
  );
}

String? _required(String? v) => (v ?? '').trim().isEmpty ? 'Required' : null;
String? _email(String? v) =>
    RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch((v ?? '').trim())
    ? null
    : 'Enter a valid email';

/// Order a saved kit: quantities by size, the design confirmed as final, the
/// names and numbers on the back, and delivery details (POST /orders).
Future<void> showOrderKitSheet(
  BuildContext context,
  AppController c,
  Project p,
) async {
  if (!c.signedIn) {
    showToast(context, 'Sign in to order kits.');
    c.go(AppScreen.auth);
    return;
  }
  await _sheet(context, _OrderForm(c, p));
}

/// One row of the players list, with its text fields.
class _PlayerRow {
  _PlayerRow(this.player)
    : name = TextEditingController(text: player.name),
      number = TextEditingController(text: player.number);
  final OrderPlayer player;
  final TextEditingController name, number;
  final key = UniqueKey();

  void dispose() {
    name.dispose();
    number.dispose();
  }
}

class _OrderForm extends StatefulWidget {
  const _OrderForm(this.c, this.p);
  final AppController c;
  final Project p;
  @override
  State<_OrderForm> createState() => _OrderFormState();
}

class _OrderFormState extends State<_OrderForm> {
  final _form = GlobalKey<FormState>();
  final _sizes = <String, int>{};
  late final _name = TextEditingController(text: widget.c.user?.name ?? '');
  final _phone = TextEditingController(),
      _address = TextEditingController(),
      _notes = TextEditingController(),
      _paste = TextEditingController();

  /// What goes on the back. The same name and number, and a list's first
  /// row, start from the design's.
  BackNames? _names;
  late final _same = OrderPlayer(
    name: widget.p.kit.backName,
    number: orderDigits(widget.p.kit.number),
  );
  late final _sameName = TextEditingController(text: _same.name);
  late final _sameNumber = TextEditingController(text: _same.number);
  List<_PlayerRow> _rows = [];

  /// The list was changed by hand: pasted players are added to the rows with
  /// a name or number (otherwise they replace the starting rows).
  bool _edited = false, _pasting = false;
  bool _busy = false, _final = false, _tried = false;
  // "More sizes": 5XL–8XL, the Womens (W8–W24) and Kids (2Y–16Y) sizes.
  bool _moreSizes = false;
  String? _error, _pasted;

  bool get _list => _names == BackNames.list;
  List<OrderPlayer> get _players => [for (final r in _rows) r.player];
  Map<String, int> get _shown => _list ? countSizes(_players) : _sizes;
  int get _total => _shown.values.fold(0, (a, b) => a + b);

  @override
  void dispose() {
    for (final t in [
      _name,
      _phone,
      _address,
      _notes,
      _paste,
      _sameName,
      _sameNumber,
    ]) {
      t.dispose();
    }
    for (final r in _rows) {
      r.dispose();
    }
    super.dispose();
  }

  String? _problem() {
    if (!_list && _total < 1) return 'Add at least one garment to the order.';
    if (!_final) return 'Tick “This design is final” to place the order.';
    return namesProblem(_names, _same, _players) ??
        (_name.text.trim().isEmpty ? 'Add a contact name.' : null);
  }

  /// Replaces the players list; the old rows' fields are freed after the
  /// frame that removes them.
  void _setRows(List<OrderPlayer> players) {
    final old = _rows;
    _rows = [for (final p in players) _PlayerRow(p)];
    WidgetsBinding.instance.addPostFrameCallback((_) {
      for (final r in old) {
        r.dispose();
      }
    });
  }

  void _choose(BackNames names) => setState(() {
    _names = names;
    // A list starts with one row for each garment already counted above.
    if (names == BackNames.list && !_edited) {
      _setRows(
        rowsForSizes(
          _sizes,
          name: widget.p.kit.backName,
          number: widget.p.kit.number,
        ),
      );
    }
  });

  void _addRow() => setState(() {
    _rows.add(
      _PlayerRow(
        OrderPlayer(size: _rows.isEmpty ? null : _rows.last.player.size),
      ),
    );
    _edited = true;
  });

  void _removeRow(_PlayerRow row) {
    setState(() {
      _rows.remove(row);
      _edited = true;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => row.dispose());
  }

  void _addPasted() {
    final found = parsePlayers(_paste.text);
    if (found.isEmpty) {
      setState(
        () => _pasted =
            'No players found. Put one player on each line: name, number, size.',
      );
      return;
    }
    final kept = _edited
        ? [
            for (final p in _players)
              if (p.name.trim().isNotEmpty || p.number.isNotEmpty) p,
          ]
        : <OrderPlayer>[];
    final added = found
        .take((maxPlayers - kept.length).clamp(0, maxPlayers))
        .toList();
    final noSize = added.where((p) => p.size == null).length,
        left = found.length - added.length;
    setState(() {
      _setRows([...kept, ...added]);
      _edited = true;
      _pasting = false;
      _paste.clear();
      _pasted =
          'Added ${added.length} player${added.length == 1 ? '' : 's'}.'
          '${noSize > 0 ? ' Choose a size for $noSize of them.' : ''}'
          '${left > 0 ? ' The list is full at $maxPlayers: $left not added.' : ''}';
    });
  }

  Future<void> _send() async {
    setState(() => _tried = true);
    final valid = _form.currentState!.validate();
    if (!valid || _problem() != null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final order = await widget.c.orderKit(widget.p, {
        'sizes': {
          for (final e in _shown.entries)
            if (e.value > 0) e.key: e.value,
        },
        'design_final': true,
        ...namesBody(_names!, _same, _players),
        'contact_name': _name.text.trim(),
        'phone': _phone.text.trim(),
        'shipping_address': _address.text.trim(),
        'notes': _notes.text.trim(),
      });
      if (!mounted) return;
      Navigator.pop(context);
      showToast(
        context,
        'Order ${order['number'] ?? ''} sent. We’ll confirm the price and timing.',
      );
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _stepper(String size) {
    final n = _shown[size] ?? 0;
    final fixed = _list;
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: n > 0 ? Palette.cyan : Palette.border),
        borderRadius: BorderRadius.circular(10),
        color: Palette.surface2,
      ),
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            size,
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _tiny(
                Icons.remove,
                !fixed && n > 0
                    ? () => setState(() => _sizes[size] = n - 1)
                    : null,
                'Fewer $size',
              ),
              SizedBox(
                width: 26,
                child: Text(
                  '$n',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: n > 0 ? Palette.cyan : Palette.muted,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              _tiny(
                Icons.add,
                fixed ? null : () => setState(() => _sizes[size] = n + 1),
                'More $size',
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _tiny(IconData icon, VoidCallback? onTap, String label) => IconButton(
    tooltip: label,
    onPressed: onTap,
    icon: Icon(icon, size: 16),
    visualDensity: VisualDensity.compact,
    constraints: const BoxConstraints(minWidth: 30, minHeight: 30),
    padding: EdgeInsets.zero,
  );

  /// The kit's saved pictures: the 3D preview (or the AI front render) and
  /// the AI back render, when there are any.
  Widget _shots() {
    final p = widget.p;
    final front = p.thumbnail ?? p.renderFront;
    final shots = [
      if (front != null || p.asset != null)
        ('Front', artImage(bytes: front, asset: p.asset, fit: BoxFit.contain)),
      if (p.renderBack != null)
        ('Back', artImage(bytes: p.renderBack, fit: BoxFit.contain)),
    ];
    if (shots.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        children: [
          for (final (label, image) in shots)
            Padding(
              padding: const EdgeInsets.only(right: 10),
              child: Column(
                children: [
                  SizedBox(
                    width: 112,
                    height: 140,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: ColoredBox(color: Palette.surface2, child: image),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    label.toUpperCase(),
                    style: const TextStyle(
                      color: Palette.muted,
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _box({required Widget child, bool bad = false}) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(12),
      border: Border.all(
        color: bad
            ? const Color(0xffff6b78)
            : Palette.cyan.withValues(alpha: .35),
        width: 1.3,
      ),
    ),
    child: child,
  );

  Widget _choice(BackNames value) {
    final on = _names == value;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Semantics(
        inMutuallyExclusiveGroup: true,
        checked: on,
        child: SurfaceCard(
          selected: on,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          onTap: () => _choose(value),
          child: Row(
            children: [
              Icon(
                on ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                size: 20,
                color: on ? Palette.cyan : Palette.muted,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(value.label, style: const TextStyle(fontSize: 13)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static final _numberInput = [
    FilteringTextInputFormatter.digitsOnly,
    LengthLimitingTextInputFormatter(3),
  ];

  InputDecoration _cell(String hint, bool bad) => InputDecoration(
    hintText: hint,
    isDense: true,
    counterText: '',
    contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 11),
    border: const OutlineInputBorder(),
    enabledBorder: bad
        ? const OutlineInputBorder(
            borderSide: BorderSide(color: Color(0xffff6b78)),
          )
        : null,
  );

  Widget _warn(String text) => Padding(
    padding: const EdgeInsets.only(top: 6),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Icon(
          Icons.warning_amber_rounded,
          size: 16,
          color: Color(0xffffbc75),
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(color: Color(0xffffbc75), fontSize: 12),
          ),
        ),
      ],
    ),
  );

  Widget _playerRow(int i, _PlayerRow row) {
    final bad = _tried && playerProblem(row.player) != null;
    void changed() {
      _edited = true;
      if (_tried) setState(() {});
    }

    return Padding(
      key: row.key,
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Expanded(
            child: Semantics(
              label: 'Player ${i + 1} name',
              child: TextField(
                controller: row.name,
                maxLength: 40,
                textCapitalization: TextCapitalization.characters,
                decoration: _cell('Name', bad),
                onChanged: (v) {
                  row.player.name = v;
                  changed();
                },
              ),
            ),
          ),
          const SizedBox(width: 6),
          SizedBox(
            width: 54,
            child: Semantics(
              label: 'Player ${i + 1} number',
              child: TextField(
                controller: row.number,
                keyboardType: TextInputType.number,
                inputFormatters: _numberInput,
                decoration: _cell('No.', bad),
                onChanged: (v) {
                  row.player.number = v;
                  changed();
                },
              ),
            ),
          ),
          const SizedBox(width: 6),
          SizedBox(
            width: 78,
            child: InputDecorator(
              decoration: _cell('', bad).copyWith(
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 2,
                ),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  isExpanded: true,
                  isDense: true,
                  value: row.player.size,
                  hint: const Text('Size', style: TextStyle(fontSize: 13)),
                  items: [
                    for (final s in orderSizes)
                      DropdownMenuItem(value: s, child: Text(s)),
                  ],
                  onChanged: (v) => setState(() {
                    row.player.size = v;
                    _edited = true;
                  }),
                ),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Remove player ${i + 1}',
            onPressed: () => _removeRow(row),
            icon: const Icon(Icons.delete_outline, size: 19),
            constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
            padding: EdgeInsets.zero,
          ),
        ],
      ),
    );
  }

  List<Widget> _sameFields() => [
    const SizedBox(height: 4),
    Row(
      children: [
        Expanded(
          child: TextField(
            controller: _sameName,
            maxLength: 40,
            textCapitalization: TextCapitalization.characters,
            decoration: _field(
              'Name on the back',
              hint: 'SMITH',
            ).copyWith(counterText: ''),
            onChanged: (v) => setState(() => _same.name = v),
          ),
        ),
        const SizedBox(width: 10),
        SizedBox(
          width: 92,
          child: TextField(
            controller: _sameNumber,
            keyboardType: TextInputType.number,
            inputFormatters: _numberInput,
            decoration: _field('Number', hint: '7'),
            onChanged: (v) => setState(() => _same.number = v),
          ),
        ),
      ],
    ),
    if (isPlaceholderName(_same.name))
      _warn(
        'YOUR NAME is the sample name on the design. Type the name to print on every shirt, or clear it for no name.',
      ),
  ];

  List<Widget> _listFields() => [
    const SizedBox(height: 4),
    for (final (i, r) in _rows.indexed) _playerRow(i, r),
    if (_rows.isNotEmpty && isPlaceholderName(_rows.first.player.name))
      _warn(
        'YOUR NAME is the sample name on the design. Type the player’s name instead.',
      ),
    const SizedBox(height: 4),
    Wrap(
      spacing: 8,
      runSpacing: 6,
      children: [
        OutlinedButton.icon(
          onPressed: _rows.length >= maxPlayers ? null : _addRow,
          icon: const Icon(Icons.add, size: 18),
          label: const Text('Add a player'),
        ),
        OutlinedButton.icon(
          onPressed: () => setState(() {
            _pasting = true;
            _pasted = null;
          }),
          icon: const Icon(Icons.content_paste, size: 18),
          label: const Text('Paste from Excel'),
        ),
      ],
    ),
    if (_pasting) ...[
      const SizedBox(height: 10),
      TextField(
        controller: _paste,
        autofocus: true,
        minLines: 3,
        maxLines: 6,
        decoration: _field(
          'Players to paste',
          hint: 'SMITH, 7, M\nJONES, 10, L',
        ),
      ),
      const SizedBox(height: 6),
      const Text(
        'Copy the name, number and size columns in Excel and paste them here: one player on each line.',
        style: TextStyle(color: Palette.muted, fontSize: 12),
      ),
      const SizedBox(height: 8),
      Wrap(
        spacing: 8,
        runSpacing: 6,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          GradientButton(
            label: 'ADD THESE PLAYERS',
            compact: true,
            onPressed: _addPasted,
          ),
          TextButton(
            onPressed: () => setState(() => _pasting = false),
            child: const Text('Cancel'),
          ),
        ],
      ),
    ],
    if (_pasted != null)
      Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Text(
          _pasted!,
          style: const TextStyle(color: Palette.cyan, fontSize: 12),
        ),
      ),
    const SizedBox(height: 8),
    Text(
      '${_rows.length} player${_rows.length == 1 ? '' : 's'} · the sizes above are counted from this list.',
      style: const TextStyle(color: Palette.muted, fontSize: 12),
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final wrong = _tried ? _problem() : null;
    final version = widget.p.remoteVersion;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
      child: Form(
        key: _form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('ORDER THIS KIT', style: _eyebrow),
            const SizedBox(height: 4),
            Text(
              widget.p.title,
              style: _heading,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 6),
            const Text(
              'Tell us the sizes and what goes on the back. We’ll confirm the price and timing before anything is made.',
              style: TextStyle(color: Palette.muted, fontSize: 12.5),
            ),
            const SizedBox(height: 12),
            Text(
              'Quantities by size · $_total total'
              '${_list ? ' · counted from the players list' : ''}',
              style: const TextStyle(fontSize: 12, color: Palette.muted),
            ),
            const SizedBox(height: 8),
            GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: 1.45,
              children: [
                for (final s in orderSizes)
                  if ((_shown[s] ?? 0) > 0 ||
                      (s != oldKids &&
                          (_moreSizes ||
                              (mensSizes.contains(s) &&
                                  !rareSizes.contains(s)))))
                    _stepper(s),
              ],
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () => setState(() => _moreSizes = !_moreSizes),
                child: Text(
                  _moreSizes
                      ? 'Fewer sizes'
                      : '+ More sizes: 5XL–8XL, Womens W8–W24, Kids 2Y–16Y',
                  style: const TextStyle(fontSize: 12.5),
                ),
              ),
            ),
            const SizedBox(height: 14),
            _box(
              bad: _tried && !_final,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _shots(),
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    controlAffinity: ListTileControlAffinity.leading,
                    value: _final,
                    onChanged: (on) => setState(() => _final = on ?? false),
                    title: const Text(
                      'This design is final',
                      style: TextStyle(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    subtitle: Text(
                      'We make the kit as it is saved'
                      '${version != null ? ' (version $version)' : ''}. '
                      'To change it, close this and edit it in the studio first.',
                      style: const TextStyle(
                        color: Palette.muted,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            _box(
              bad: _tried && _names == null,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Names and numbers on the back',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 8),
                  for (final value in BackNames.values) _choice(value),
                  if (_names == BackNames.same) ..._sameFields(),
                  if (_list) ..._listFields(),
                ],
              ),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _name,
              decoration: _field('Contact name'),
              maxLength: 120,
              validator: _required,
              onChanged: (_) {
                if (_tried) setState(() {});
              },
            ),
            TextFormField(
              controller: _phone,
              decoration: _field('Phone'),
              maxLength: 40,
              keyboardType: TextInputType.phone,
            ),
            TextFormField(
              controller: _address,
              decoration: _field('Delivery address'),
              maxLength: 1000,
              minLines: 1,
              maxLines: 3,
            ),
            TextFormField(
              controller: _notes,
              decoration: _field(
                'Notes',
                hint: 'Deadline, anything we should know',
              ),
              maxLength: 2000,
              minLines: 1,
              maxLines: 3,
            ),
            if ((wrong ?? _error) != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  (wrong ?? _error)!,
                  style: const TextStyle(
                    color: Color(0xffff6b78),
                    fontSize: 12.5,
                  ),
                ),
              ),
            GradientButton(
              label: _busy
                  ? 'SENDING…'
                  : 'SEND ORDER REQUEST · $_total ITEM${_total == 1 ? '' : 'S'}',
              compact: true,
              onPressed: _busy ? null : _send,
            ),
          ],
        ),
      ),
    );
  }
}

/// My orders: status, quantities and price once 3DEEZI quotes it.
class OrdersScreen extends StatefulWidget {
  const OrdersScreen(this.c, {super.key});
  final AppController c;
  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (widget.c.signedIn) _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await widget.c.loadOrders();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.c;
    return Column(
      children: [
        TopBar(
          onBack: c.back,
          title: 'My orders',
          trailing: [
            if (c.signedIn)
              IconButton(
                tooltip: 'Refresh',
                onPressed: _loading ? null : _load,
                icon: const Icon(Icons.refresh),
              ),
          ],
        ),
        Expanded(
          child: !c.signedIn
              ? _Empty(
                  'Sign in to order kits and follow them here.',
                  action: 'SIGN IN',
                  onAction: () => c.go(AppScreen.auth),
                )
              : _loading && c.orders.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : _error != null && c.orders.isEmpty
              ? _Empty(_error!, action: 'TRY AGAIN', onAction: _load)
              : c.orders.isEmpty
              ? _Empty(
                  'No orders yet. Open a project and choose “Order this kit”.',
                  action: 'MY PROJECTS',
                  onAction: () => c.go(AppScreen.projects),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.separated(
                    padding: const EdgeInsets.fromLTRB(18, 8, 18, 18),
                    itemCount: c.orders.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 12),
                    itemBuilder: (_, i) => _OrderCard(c.orders[i]),
                  ),
                ),
        ),
      ],
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty(this.text, {required this.action, required this.onAction});
  final String text, action;
  final VoidCallback onAction;
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.inventory_2_outlined, size: 42, color: Palette.cyan),
          const SizedBox(height: 12),
          Text(
            text,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Palette.muted),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: 220,
            child: GradientButton(
              label: action,
              compact: true,
              onPressed: onAction,
            ),
          ),
        ],
      ),
    ),
  );
}

const _statusColours = {
  'pending': Color(0xffffbc75),
  'confirmed': Palette.cyan,
  'in_production': Color(0xff8b78f2),
  'shipped': Color(0xff4cc9f0),
  'delivered': Color(0xff34d399),
  'cancelled': Color(0xffff6b78),
};
String statusLabel(String s) =>
    s.isEmpty ? s : (s[0].toUpperCase() + s.substring(1)).replaceAll('_', ' ');

class _OrderCard extends StatelessWidget {
  const _OrderCard(this.o);
  final Map<String, dynamic> o;

  @override
  Widget build(BuildContext context) {
    final status = '${o['status'] ?? 'pending'}',
        colour = _statusColours[status] ?? Palette.muted;
    final total = o['total'],
        // An empty list when there are no sizes yet (an uploaded order form).
        sizes = o['sizes'] is Map
            ? (o['sizes'] as Map).cast<String, dynamic>()
            : const <String, dynamic>{};
    final project = (o['project'] as Map?)?.cast<String, dynamic>();
    // A names and numbers list: one player for each shirt.
    final players = o['names'] == 'list'
        ? (o['players'] as List?)?.length ?? 0
        : 0;
    final date = DateTime.tryParse('${o['created_at']}')?.toLocal();
    return SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${o['number'] ?? 'Order'}',
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  color: colour.withValues(alpha: .14),
                  border: Border.all(color: colour.withValues(alpha: .6)),
                ),
                child: Text(
                  statusLabel(status),
                  style: TextStyle(
                    color: colour,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            project?['name'] as String? ?? 'Custom kit',
            style: const TextStyle(fontSize: 13),
          ),
          const SizedBox(height: 2),
          Text(
            '${o['quantity'] ?? 0} garments · ${sizes.entries.map((e) => '${e.key} ${e.value}').join(', ')}'
            '${players > 0 ? ' · $players player${players == 1 ? '' : 's'}' : ''}',
            style: const TextStyle(color: Palette.muted, fontSize: 11.5),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Text(
                total == null
                    ? 'Quote pending'
                    : 'A\$${double.tryParse('$total')?.toStringAsFixed(2) ?? total}',
                style: TextStyle(
                  color: total == null ? Palette.muted : Palette.cyan,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Spacer(),
              if (date != null)
                Text(
                  '${date.day}/${date.month}/${date.year}',
                  style: const TextStyle(color: Palette.muted, fontSize: 11),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
