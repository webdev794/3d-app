import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api_client.dart';
import '../app_controller.dart';
import '../money.dart';
import '../sports_catalog.dart';
import '../widgets/flow_ui.dart';
import '../widgets/notification_bell.dart';
import '../widgets/site_page_stub.dart'
    if (dart.library.js_interop) '../widgets/site_page_web.dart'
    if (dart.library.io) '../widgets/site_page_io.dart';
import '../widgets/ui.dart';
import 'order_entry.dart' show openPayPage;

/// 3DEEZI TEAM, the human designer service (client brief 2026-10-21), as on
/// the website's /team pages: the TEAM screen (how it works, allowance, my
/// requests), the request form with uploads, and one request with its
/// progress, designs to review, conversation and final design. Server: T1's
/// team-api.md (`/api/v1/team/...`).

typedef TeamPick = ({String name, Uint8List bytes});

/// Picks files for a request: 'logos', 'references' or 'files' (replaced in
/// tests).
Future<List<TeamPick>> Function(String kind) pickTeamFiles = _pickFiles;

Future<List<TeamPick>> _pickFiles(String kind) async {
  final files = await openFiles(
    acceptedTypeGroups: [
      XTypeGroup(
        label: kind == 'logos' ? 'Logos' : 'Pictures and documents',
        extensions: kind == 'logos' ? teamLogoTypes : teamReferenceTypes,
      ),
    ],
  );
  return [for (final f in files) (name: f.name, bytes: await f.readAsBytes())];
}

const teamLogoTypes = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'pdf', 'ai', 'eps'];
const teamReferenceTypes = [
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'pdf', 'ai', 'eps', 'doc', //
  'docx', 'ppt', 'pptx', 'txt', 'zip',
];
const teamSteps = [
  'Request received',
  'Designer assigned',
  'Design in progress',
  'Ready for review',
  'Approved',
];
const _swatches = [
  '#0a0f16', '#ffffff', '#12e1f0', '#0a2342', '#1f5fff', '#7b5cff', //
  '#e11d48', '#f97316', '#facc15', '#16a34a', '#6b7280', '#b8860b',
];

Color? _hexColour(String value) {
  final hex = value.replaceFirst('#', '');
  if (!RegExp(r'^[0-9a-fA-F]{6}$').hasMatch(hex)) return null;
  return Color(int.parse('ff$hex', radix: 16));
}

/// "A$1,234.00", the website's price style (money.dart); "To be confirmed"
/// without an amount.
String _money(Object? amount, Object? currency) => moneyOr(amount, currency);

/// TEAM prices include GST (client answers 2026-10-21).
String _incl(Object? amount, Object? currency) =>
    '${_money(amount, currency)} incl. GST';

/// The refund policy (client answers 2026-10-21), as on the website's /team.
const teamRefundPolicy =
    'Full refund if you cancel before your designer starts. No refund once the first draft is delivered, though 3DEEZI may give an account credit where fair. Full refund if 3DEEZI can’t deliver as promised.';

/// The turnaround promise, with the server's numbers when the plan is loaded.
String teamPromise(Map? allowance) {
  final t = (allowance?['turnaround'] as Map?) ?? const {};
  return 'First design within ${_businessDays(t['first_draft_days'] ?? 3)}';
}

/// "1 business day", "3 business days" (the server's numbers).
String _businessDays(Object n) => '$n business day${'$n' == '1' ? '' : 's'}';

/// "Jersey, Shorts": every garment asked for (older requests: the one garment).
String teamGarmentsText(Map r) {
  final names = [
    for (final n in (r['garment_names'] as List?) ?? const []) '$n',
  ].where((n) => n.isNotEmpty).toList();
  return names.isNotEmpty
      ? names.join(', ')
      : '${r['garment_name'] ?? r['garment']}';
}

String _isoDate(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

/// Turnaround, revisions and refunds (client answers 2026-10-21), small and
/// folded under the form, without prices: every price and plan name comes
/// from the server (the client's TEAM page, 2026-10-22).
class TeamGoodToKnow extends StatelessWidget {
  const TeamGoodToKnow({super.key, this.allowance});
  final Map? allowance;

  @override
  Widget build(BuildContext context) {
    final t = (allowance?['turnaround'] as Map?) ?? const {};
    final revisions = allowance?['revisions_per_request'];
    Widget row(IconData icon, String title, String text) => Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: Palette.cyan),
          const SizedBox(width: 10),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    text: '$title  ',
                    style: const TextStyle(fontWeight: FontWeight.w800),
                  ),
                  TextSpan(
                    text: text,
                    style: const TextStyle(color: Palette.muted),
                  ),
                ],
              ),
              style: const TextStyle(fontSize: 13, height: 1.4),
            ),
          ),
        ],
      ),
    );
    return Material(
      key: const Key('team-good-to-know'),
      color: Palette.surface,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: Color(0x3312e1f0)),
      ),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 14),
          childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 6),
          leading: const Icon(
            Icons.info_outline,
            color: Palette.cyan,
            size: 20,
          ),
          iconColor: Palette.cyan,
          collapsedIconColor: Palette.muted,
          title: const Text(
            'Good to know: turnaround, revisions and refunds',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          ),
          children: [
            row(
              Icons.event_available_outlined,
              'Turnaround',
              'First design within ${_businessDays(t['first_draft_days'] ?? 3)}; each revision within ${_businessDays(t['revision_days'] ?? 2)} (Monday to Friday). A request with a fee starts once it is paid.',
            ),
            row(
              Icons.refresh,
              'Revisions',
              '${revisions == null ? 'Every request includes revisions.' : 'Your plan includes $revisions revision${'$revisions' == '1' ? '' : 's'} per request.'} Need more? Ask your designer for an extra round; any fee is shown before it starts.',
            ),
            row(Icons.verified_user_outlined, 'Refunds', teamRefundPolicy),
          ],
        ),
      ),
    );
  }
}

String _day(Object? iso) {
  final d = DateTime.tryParse('$iso')?.toLocal();
  if (d == null) return '';
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return '${d.day} ${months[d.month - 1]}';
}

String _ext(String name) =>
    name.contains('.') ? name.split('.').last.toLowerCase() : '';

Color _tone(String status) => switch (status) {
  'review' => Palette.cyan,
  'approved' => const Color(0xff5ee08f),
  'awaiting_payment' || 'revision' => const Color(0xfff5c26b),
  'in_progress' => const Color(0xffb9a3ff),
  'closed' => Palette.muted,
  _ => const Color(0xff7cc4ff),
};

/// Signed out: the account screen first (the TEAM screens need an account).
void _signIn(BuildContext context, AppController c) {
  showToast(context, 'Sign in to request a designer.');
  Navigator.of(context).popUntil((r) => r.isFirst);
  c.go(AppScreen.auth);
}

class TeamStatusChip extends StatelessWidget {
  const TeamStatusChip(this.request, {super.key});
  final Map<String, dynamic> request;
  @override
  Widget build(BuildContext context) {
    final tone = _tone('${request['status']}');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        color: tone.withValues(alpha: .12),
        border: Border.all(color: tone.withValues(alpha: .7)),
      ),
      child: Text(
        '${request['status_label'] ?? request['status']}',
        style: TextStyle(
          color: tone,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

/// The progress steps; "Revisions requested" in place of "Ready for review".
class TeamStepsBar extends StatelessWidget {
  const TeamStepsBar(this.request, {super.key});
  final Map<String, dynamic> request;
  @override
  Widget build(BuildContext context) {
    final status = '${request['status']}';
    if (status == 'awaiting_payment' || status == 'closed') {
      return SurfaceCard(
        child: Text(
          status == 'closed'
              ? 'This request is closed.'
              : 'Waiting for payment: your designer starts as soon as the invoice is paid.',
          style: TextStyle(color: _tone(status)),
        ),
      );
    }
    final at = (request['stage_index'] as num?)?.toInt() ?? 0;
    return SurfaceCard(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        children: [
          for (final (i, label) in teamSteps.indexed)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  _StepDot(
                    i + 1,
                    done: i < at || status == 'approved',
                    current: i == at && status != 'approved',
                  ),
                  const SizedBox(width: 12),
                  Text(
                    (i == 3 && status == 'revision'
                            ? 'Revisions requested'
                            : label)
                        .toUpperCase(),
                    style: TextStyle(
                      fontFamily: 'Rajdhani',
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                      letterSpacing: 1,
                      color: i == at && status != 'approved'
                          ? Palette.cyan
                          : i < at || status == 'approved'
                          ? Palette.text
                          : Palette.muted,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _StepDot extends StatelessWidget {
  const _StepDot(this.n, {required this.done, required this.current});
  final int n;
  final bool done, current;
  @override
  Widget build(BuildContext context) => Container(
    width: 26,
    height: 26,
    alignment: Alignment.center,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      gradient: done
          ? const LinearGradient(colors: [Color(0xff12e2f1), Color(0xff6d74ff)])
          : null,
      color: done ? null : const Color(0xff0a1726),
      border: Border.all(
        color: done || current ? Palette.cyan : Palette.border,
        width: 2,
      ),
      boxShadow: current
          ? [
              BoxShadow(
                color: Palette.cyan.withValues(alpha: .5),
                blurRadius: 10,
              ),
            ]
          : null,
    ),
    child: done
        ? const Icon(Icons.check, size: 14, color: Color(0xff04192b))
        : Text(
            '$n',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: current ? Palette.cyan : Palette.muted,
            ),
          ),
  );
}

// ---------------------------------------------------------------- TEAM screen

/// What the brief has so far, for YOUR DESIGN REQUEST's ticks.
class TeamBriefProgress {
  const TeamBriefProgress({
    this.garments = false,
    this.inspiration = false,
    this.logos = false,
    this.date = false,
  });
  final bool garments, inspiration, logos, date;

  @override
  bool operator ==(Object other) =>
      other is TeamBriefProgress &&
      other.garments == garments &&
      other.inspiration == inspiration &&
      other.logos == logos &&
      other.date == date;

  @override
  int get hashCode => Object.hash(garments, inspiration, logos, date);
}

/// The 3DEEZI DESIGN TEAM screen, as the website's /team (the client's
/// design, 2026-10-22): the photo hero, HOW IT WORKS in seven steps, the
/// request form, YOUR DESIGN REQUEST with the fees line, and Good to know.
class TeamScreen extends StatefulWidget {
  const TeamScreen(this.c, {super.key});
  final AppController c;
  @override
  State<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends State<TeamScreen> {
  Map<String, dynamic>? _allowance;
  String? _error;
  var _progress = const TeamBriefProgress();
  final _formAnchor = GlobalKey();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!widget.c.signedIn) return;
    setState(() => _error = null);
    try {
      final allowance = await widget.c.api.teamAllowance();
      if (!mounted) return;
      setState(() => _allowance = allowance);
      // The bell's shared list; the TEAM bell counts the TEAM ones.
      await NotificationFeed.of(widget.c).refresh();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  /// REQUEST A DESIGNER: down to the form (signed out: sign in first, as the
  /// brief is sent from the account).
  void _request() {
    if (!widget.c.signedIn) return _signIn(context, widget.c);
    final target = _formAnchor.currentContext;
    if (target != null) {
      Scrollable.ensureVisible(
        target,
        duration: const Duration(milliseconds: 450),
        curve: Curves.easeOutCubic,
      );
    }
  }

  Future<void> _myRequests() async {
    if (!widget.c.signedIn) return _signIn(context, widget.c);
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => TeamRequestsScreen(widget.c)),
    );
    if (mounted) unawaited(_load());
  }

  Future<void> _open(int id) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => TeamRequestScreen(widget.c, id)),
    );
    if (mounted) unawaited(_load());
  }

  /// "View subscription options": the plans screen (the website's /pricing).
  void _plans() {
    Navigator.of(context).popUntil((r) => r.isFirst);
    widget.c.go(AppScreen.pricing);
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.c;
    return Scaffold(
      backgroundColor: Palette.bg,
      body: SafeArea(
        child: Column(
          children: [
            TopBar(
              onBack: () => Navigator.of(context).maybePop(),
              title: '3DEEZI TEAM',
              trailing: [
                if (c.signedIn)
                  NotificationBell(
                    c,
                    only: isTeamNotification,
                    title: '3DEEZI TEAM notifications',
                    onClosed: _load,
                  ),
              ],
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _load,
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
                  child: Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 760),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _TeamHero(
                            onRequest: _request,
                            onMyRequests: _myRequests,
                          ),
                          const SizedBox(height: 26),
                          const TeamHowItWorks(),
                          const SizedBox(height: 26),
                          if (_error != null)
                            Padding(
                              padding: const EdgeInsets.only(bottom: 10),
                              child: Text(
                                _error!,
                                style: const TextStyle(
                                  color: Color(0xffff8b9b),
                                ),
                              ),
                            ),
                          KeyedSubtree(
                            key: _formAnchor,
                            child: TeamRequestForm(
                              c,
                              allowance: _allowance,
                              onProgress: (p) {
                                if (mounted && p != _progress) {
                                  setState(() => _progress = p);
                                }
                              },
                              onViewRequest: _open,
                              onSent: _load,
                            ),
                          ),
                          const SizedBox(height: 12),
                          TeamGoodToKnow(allowance: _allowance),
                          const SizedBox(height: 14),
                          TeamChecklist(progress: _progress, onPlans: _plans),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TeamHero extends StatelessWidget {
  const _TeamHero({required this.onRequest, required this.onMyRequests});
  final VoidCallback onRequest, onMyRequests;
  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(16),
    child: Container(
      decoration: BoxDecoration(
        color: const Color(0xff020912),
        border: Border.all(
          color: Palette.cyan.withValues(alpha: .5),
          width: 1.5,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Stack(
        children: [
          // The designer at his two monitors (the 3D singlet and the flat
          // pattern pieces), as on the website's /team.
          Positioned(
            left: 0,
            right: 0,
            top: 0,
            height: 250,
            child: artImage(
              asset: 'assets/images/art/team_hero.webp',
              alignment: const Alignment(.42, -.25),
            ),
          ),
          const Positioned(
            left: 0,
            right: 0,
            top: 0,
            height: 252,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  stops: [0, .55, .85, 1],
                  colors: [
                    Color(0x00020912),
                    Color(0x22020912),
                    Color(0xcc020912),
                    Color(0xff020912),
                  ],
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 200, 18, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.groups_outlined, size: 16, color: Palette.cyan),
                    SizedBox(width: 8),
                    Text(
                      'HUMAN DESIGN SERVICE',
                      style: TextStyle(
                        color: Palette.cyan,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 2.4,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                // "3DEEZI" as the logo wordmark (the user, 2026-10-21) and
                // "DESIGN TEAM" in the cyan-blue gradient.
                Wrap(
                  crossAxisAlignment: WrapCrossAlignment.end,
                  spacing: 9,
                  runSpacing: 4,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(bottom: 3),
                      child: Image.asset(
                        'assets/images/brand-wordmark.png',
                        height: 29,
                        semanticLabel: '3DEEZI',
                      ),
                    ),
                    ShaderMask(
                      shaderCallback: (r) => const LinearGradient(
                        colors: [
                          Color(0xff12e3f2),
                          Color(0xff19bdfc),
                          Color(0xff2f8dff),
                        ],
                        stops: [0, .6, 1],
                      ).createShader(r),
                      child: const Text(
                        'DESIGN TEAM',
                        style: TextStyle(
                          fontFamily: 'Rajdhani',
                          fontSize: 40,
                          height: 1,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  'REAL DESIGNERS. REAL RESULTS.',
                  style: TextStyle(
                    fontFamily: 'Rajdhani',
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 2.6,
                    color: Palette.cyan,
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Share your ideas, logos and examples.\nOur design team will bring your kit to life.',
                  style: TextStyle(
                    fontSize: 14,
                    height: 1.5,
                    color: Color(0xffe6eef5),
                  ),
                ),
                const SizedBox(height: 16),
                GradientButton(
                  label: 'REQUEST A DESIGNER',
                  icon: Icons.arrow_forward,
                  onPressed: onRequest,
                ),
                const SizedBox(height: 10),
                SecondaryButton(
                  label: 'VIEW MY REQUESTS',
                  icon: Icons.description_outlined,
                  onPressed: onMyRequests,
                ),
                const SizedBox(height: 16),
                for (final (icon, text) in const [
                  (Icons.groups_outlined, 'Personal design support'),
                  (Icons.checkroom_outlined, 'Custom sportswear expertise'),
                  (Icons.verified_user_outlined, 'Review before you approve'),
                ])
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        Icon(icon, size: 20, color: Palette.cyan),
                        const SizedBox(width: 10),
                        Flexible(
                          child: Text(
                            text,
                            style: const TextStyle(
                              fontSize: 13,
                              color: Color(0xffd5e1ea),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

/// The client's seven steps (2026-10-22), from the brief to delivery.
const teamLoopSteps = <(IconData, String, String)>[
  (Icons.description_outlined, 'Share your brief', 'Ideas, colours & examples'),
  (Icons.edit_outlined, 'Designer creates', 'Your first concept'),
  (Icons.chat_outlined, 'Review & refine', 'Share your feedback'),
  (
    Icons.check_circle_outline,
    'Approve your order',
    'Check artwork, sizes & quantities',
  ),
  (Icons.credit_card, 'Payment', 'Complete secure checkout'),
  (Icons.settings_outlined, 'Production', 'Your garments are made'),
  (Icons.local_shipping_outlined, 'Delivery', 'Track your order'),
];

/// HOW IT WORKS, FROM IDEA TO TEAMWEAR: the seven steps joined by a line (the
/// website draws them as a loop on wide screens and as this list on phones).
class TeamHowItWorks extends StatelessWidget {
  const TeamHowItWorks({super.key});
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      const ScreenTitle(
        'How it ',
        highlight: 'works',
        size: 22,
        align: TextAlign.start,
      ),
      const SizedBox(height: 6),
      const Text.rich(
        TextSpan(
          children: [
            TextSpan(text: 'FROM IDEA TO '),
            TextSpan(
              text: 'TEAMWEAR',
              style: TextStyle(color: Palette.cyan),
            ),
          ],
        ),
        style: TextStyle(
          fontFamily: 'Rajdhani',
          fontSize: 18,
          fontWeight: FontWeight.w700,
          letterSpacing: 1,
        ),
      ),
      const SizedBox(height: 14),
      Stack(
        children: [
          Positioned(
            left: 29,
            top: 20,
            bottom: 20,
            child: Container(
              width: 2,
              decoration: BoxDecoration(
                color: const Color(0xff22d8ef),
                boxShadow: [
                  BoxShadow(
                    color: Palette.cyan.withValues(alpha: .6),
                    blurRadius: 6,
                  ),
                ],
              ),
            ),
          ),
          Column(
            children: [
              for (final (i, (icon, title, sub)) in teamLoopSteps.indexed)
                Padding(
                  padding: EdgeInsets.only(
                    bottom: i == teamLoopSteps.length - 1 ? 0 : 10,
                  ),
                  child: _LoopStep(
                    n: i + 1,
                    icon: icon,
                    title: title,
                    sub: sub,
                  ),
                ),
            ],
          ),
        ],
      ),
    ],
  );
}

class _LoopStep extends StatelessWidget {
  const _LoopStep({
    required this.n,
    required this.icon,
    required this.title,
    required this.sub,
  });
  final int n;
  final IconData icon;
  final String title, sub;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
    decoration: BoxDecoration(
      gradient: const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(0xff0b1a2b), Color(0xff07121f)],
      ),
      borderRadius: BorderRadius.circular(10),
      border: Border.all(color: const Color(0x661fb6d4)),
    ),
    child: Row(
      children: [
        Container(
          width: 30,
          height: 30,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: const Color(0xff07121f),
            border: Border.all(color: const Color(0xff22d8ef), width: 1.5),
          ),
          child: Text(
            '$n',
            style: const TextStyle(
              fontFamily: 'Rajdhani',
              fontWeight: FontWeight.w700,
              fontSize: 15,
            ),
          ),
        ),
        const SizedBox(width: 12),
        Icon(icon, color: Palette.cyan, size: 22),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                sub,
                style: const TextStyle(color: Palette.muted, fontSize: 12),
              ),
            ],
          ),
        ),
      ],
    ),
  );
}

/// YOUR DESIGN REQUEST: what a good brief has (ticked as the form gets it),
/// the fees line and View subscription options.
class TeamChecklist extends StatelessWidget {
  const TeamChecklist({
    super.key,
    required this.progress,
    required this.onPlans,
  });
  final TeamBriefProgress progress;
  final VoidCallback onPlans;

  @override
  Widget build(BuildContext context) {
    final rows = [
      (
        Icons.checkroom_outlined,
        'Garment types & quantities',
        'Tell us what you need',
        progress.garments,
      ),
      (
        Icons.palette_outlined,
        'Colours & inspiration',
        'Share references or examples',
        progress.inspiration,
      ),
      (
        Icons.image_outlined,
        'Logos & sponsor artwork',
        'Upload your files',
        progress.logos,
      ),
      (
        Icons.calendar_month_outlined,
        'Preferred delivery date',
        'Let us know if you have a target date',
        progress.date,
      ),
    ];
    return SurfaceCard(
      key: const Key('team-checklist'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'YOUR DESIGN REQUEST',
            style: TextStyle(
              color: Palette.cyan,
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 2.4,
            ),
          ),
          const SizedBox(height: 12),
          for (final (icon, title, sub, done) in rows)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: const Color(0xff07111d),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: done
                        ? const Color(0x5512e1f0)
                        : const Color(0x17ffffff),
                  ),
                ),
                child: Row(
                  children: [
                    Icon(icon, color: Palette.cyan, size: 24),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            style: const TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            sub,
                            style: const TextStyle(
                              color: Palette.muted,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (done)
                      Semantics(
                        label: 'Added',
                        child: Container(
                          key: Key('team-check-$title'),
                          width: 20,
                          height: 20,
                          decoration: const BoxDecoration(
                            shape: BoxShape.circle,
                            gradient: LinearGradient(
                              colors: [Color(0xff12e2f1), Color(0xff2d8fff)],
                            ),
                          ),
                          child: const Icon(
                            Icons.check,
                            size: 13,
                            color: Color(0xff04192b),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          const SizedBox(height: 6),
          Container(
            key: const Key('team-fees'),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xff07111d),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: const Color(0x17ffffff)),
            ),
            child: const Row(
              children: [
                CircleAvatar(
                  radius: 12,
                  backgroundColor: Color(0xff1fc8f0),
                  child: Text(
                    'i',
                    style: TextStyle(
                      color: Color(0xff031423),
                      fontWeight: FontWeight.w800,
                      fontFamily: 'serif',
                    ),
                  ),
                ),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Design service availability and any fees are confirmed before work begins.',
                    style: TextStyle(fontSize: 13, height: 1.4),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 6),
          TextButton(
            onPressed: onPlans,
            style: TextButton.styleFrom(
              padding: EdgeInsets.zero,
              foregroundColor: Palette.cyan,
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: Text(
                    'View subscription options',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
                SizedBox(width: 6),
                Icon(Icons.arrow_forward, size: 16),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// My design requests (the website's /team/requests).
class TeamRequestsScreen extends StatefulWidget {
  const TeamRequestsScreen(this.c, {super.key});
  final AppController c;
  @override
  State<TeamRequestsScreen> createState() => _TeamRequestsScreenState();
}

class _TeamRequestsScreenState extends State<TeamRequestsScreen> {
  List<Map<String, dynamic>>? _requests;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final list = await widget.c.api.teamRequests();
      if (mounted) setState(() => _requests = list);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _open(int id) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => TeamRequestScreen(widget.c, id)),
    );
    if (mounted) unawaited(_load());
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Palette.bg,
    body: SafeArea(
      child: Column(
        children: [
          TopBar(
            onBack: () => Navigator.of(context).maybePop(),
            title: 'MY DESIGN REQUESTS',
            trailing: [
              NotificationBell(
                widget.c,
                only: isTeamNotification,
                title: '3DEEZI TEAM notifications',
                onClosed: _load,
              ),
            ],
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
                children: [
                  if (_error != null)
                    Text(
                      _error!,
                      style: const TextStyle(color: Color(0xffff8b9b)),
                    )
                  else if (_requests == null)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.all(24),
                        child: CircularProgressIndicator(),
                      ),
                    )
                  else if (_requests!.isEmpty) ...[
                    const Text(
                      'No design requests yet. Your requests and their progress appear here.',
                      style: TextStyle(color: Palette.muted),
                    ),
                    const SizedBox(height: 16),
                    GradientButton(
                      label: 'REQUEST A DESIGNER',
                      icon: Icons.arrow_forward,
                      onPressed: () => Navigator.of(context).maybePop(),
                    ),
                  ] else
                    for (final r in _requests!)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: TeamRequestTile(
                          r,
                          onTap: () => _open((r['id'] as num).toInt()),
                        ),
                      ),
                ],
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class TeamRequestTile extends StatelessWidget {
  const TeamRequestTile(this.r, {super.key, required this.onTap});
  final Map<String, dynamic> r;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final unread = (r['unread'] as num?)?.toInt() ?? 0;
    return SurfaceCard(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      '${r['number']}',
                      style: const TextStyle(
                        fontFamily: 'Rajdhani',
                        fontWeight: FontWeight.w700,
                        fontSize: 16,
                        color: Palette.cyan,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Flexible(child: TeamStatusChip(r)),
                  ],
                ),
                const SizedBox(height: 5),
                Text(
                  '${teamGarmentsText(r)} · ${r['sport_name'] ?? r['sport']}',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                Text(
                  '${r['name']} · ${_day(r['created_at'])}${r['preferred_date'] != null ? ' · wanted by ${_day(r['preferred_date'])}' : ''}',
                  style: const TextStyle(color: Palette.muted, fontSize: 12),
                ),
              ],
            ),
          ),
          if (unread > 0)
            Badge(
              label: Text('$unread'),
              backgroundColor: Palette.cyan,
              textColor: Palette.bg,
            ),
          const SizedBox(width: 6),
          const Icon(Icons.chevron_right, color: Palette.muted),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------- the form

/// A file for the brief: a logo (logos[], up to 5) or artwork and inspiration
/// (references[], up to 10), from one "Add files" box.
typedef TeamBriefFile = ({TeamPick pick, String kind});

/// "Tell us what you need" (the client's TEAM form, 2026-10-22): the company /
/// team name and contact email from the account, sport / activity and the
/// garments needed from the catalogue, the design brief, one box for logos,
/// artwork and inspiration, and an optional preferred delivery date. On the
/// TEAM screen and on its own screen.
class TeamRequestForm extends StatefulWidget {
  const TeamRequestForm(
    this.c, {
    super.key,
    this.allowance,
    this.onProgress,
    this.onViewRequest,
    this.onSent,
  });
  final AppController c;
  final Map<String, dynamic>? allowance;
  final ValueChanged<TeamBriefProgress>? onProgress;
  final ValueChanged<int>? onViewRequest;
  final VoidCallback? onSent;
  @override
  State<TeamRequestForm> createState() => _TeamRequestFormState();
}

class _TeamRequestFormState extends State<TeamRequestForm> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.c.user?.name ?? '');
  late final _email = TextEditingController(text: widget.c.user?.email ?? '');
  final _description = TextEditingController();
  final _instructions = TextEditingController();
  final _hex = TextEditingController();
  final _otherGarment = TextEditingController();
  String? _sport;
  final _garments = <String>[];
  DateTime? _date;
  final _colours = <String>[];
  final _files = <TeamBriefFile>[];
  bool _more = false;
  List<({String id, String name, String group, List<String> garments})>
  _sports = [];
  List<({String id, String name})> _garmentList = [];
  bool _busy = false;
  String? _error;
  Map<String, dynamic>? _sent;
  TeamBriefProgress? _told;
  String _key = _newKey();

  static String _newKey() =>
      'app-${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(1 << 30)}';

  @override
  void initState() {
    super.initState();
    _fallbackCatalog();
    _loadCatalog();
    // "Colours & inspiration" is ticked once the brief says something.
    _description.addListener(_briefChanged);
  }

  void _briefChanged() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    for (final t in [
      _name,
      _email,
      _description,
      _instructions,
      _hex,
      _otherGarment,
    ]) {
      t.dispose();
    }
    super.dispose();
  }

  /// Offline: the app's own copy of the catalogue (it mirrors the website's).
  void _fallbackCatalog() {
    _sports = [
      for (final s in sportCategories)
        (id: s.id, name: s.name, group: s.group, garments: const <String>[]),
    ];
    _garmentList = const [
      (id: 'jersey', name: 'Jersey'),
      (id: 'shorts', name: 'Shorts'),
      (id: 'tee', name: 'Training Tee'),
      (id: 'singlet', name: 'Singlet'),
      (id: 'polo', name: 'Polo'),
    ];
  }

  /// The sports and garments from the website's catalogue (new ones appear
  /// without an app update).
  Future<void> _loadCatalog() async {
    try {
      final cat = await widget.c.api.catalog();
      final sports = ((cat['sports'] as List?) ?? const []).cast<Map>();
      final garments = ((cat['garments'] as List?) ?? const []).cast<Map>();
      if (!mounted || sports.isEmpty) return;
      setState(() {
        _sports = [
          for (final s in sports)
            (
              id: '${s['id']}',
              name: '${s['name']}',
              group: '${s['group'] ?? 'sports'}',
              garments: [
                for (final g in (s['garments'] as List?) ?? const []) '$g',
              ],
            ),
        ];
        if (garments.isNotEmpty) {
          _garmentList = [
            for (final g in garments) (id: '${g['id']}', name: '${g['name']}'),
          ];
        }
      });
    } on Object {
      // Keep the app's copy.
    }
  }

  /// The chosen sport's garments first.
  List<({String id, String name})> get _garmentChoices {
    final wanted =
        _sports.where((s) => s.id == _sport).firstOrNull?.garments ?? const [];
    if (wanted.isEmpty) return _garmentList;
    return [
      for (final id in wanted) ..._garmentList.where((g) => g.id == id),
      ..._garmentList.where((g) => !wanted.contains(g.id)),
    ];
  }

  String _garmentName(String id) =>
      _garmentList.where((g) => g.id == id).firstOrNull?.name ?? id;

  TeamBriefProgress get _progress => TeamBriefProgress(
    garments: _garments.isNotEmpty,
    inspiration:
        _description.text.trim().length >= 10 ||
        _colours.isNotEmpty ||
        _files.any((f) => f.kind == 'reference'),
    logos: _files.any((f) => f.kind == 'logo'),
    date: _date != null,
  );

  /// Tells the TEAM screen's checklist (after this frame).
  void _tell() {
    final p = _progress;
    if (p == _told || widget.onProgress == null) return;
    _told = p;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) widget.onProgress?.call(p);
    });
  }

  void _toggleGarment(String id) => setState(() {
    if (_garments.contains(id)) {
      _garments.remove(id);
    } else if (_garments.length < 12) {
      _garments.add(id);
    }
  });

  Future<void> _pickGarments(FormFieldState<List<String>> field) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Palette.surface,
      builder: (sheet) => StatefulBuilder(
        builder: (sheet, setSheet) {
          void toggle(String id) {
            _toggleGarment(id);
            setSheet(() {});
          }

          final custom = _garments.where(
            (g) => !_garmentList.any((x) => x.id == g),
          );
          return SafeArea(
            child: Padding(
              padding: EdgeInsets.fromLTRB(
                16,
                14,
                16,
                12 + MediaQuery.of(sheet).viewInsets.bottom,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'Garments needed',
                          style: TextStyle(
                            fontFamily: 'Rajdhani',
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      IconButton(
                        key: const ValueKey('sheet-close'),
                        tooltip: 'Close',
                        visualDensity: VisualDensity.compact,
                        onPressed: () => Navigator.of(sheet).pop(),
                        icon: const Icon(Icons.close, color: Palette.text),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Flexible(
                    child: ListView(
                      shrinkWrap: true,
                      children: [
                        for (final g in [
                          ..._garmentChoices,
                          for (final id in custom) (id: id, name: id),
                        ])
                          CheckboxListTile(
                            dense: true,
                            value: _garments.contains(g.id),
                            title: Text(g.name),
                            activeColor: Palette.cyan,
                            controlAffinity: ListTileControlAffinity.leading,
                            contentPadding: EdgeInsets.zero,
                            onChanged: (_) => toggle(g.id),
                          ),
                      ],
                    ),
                  ),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          key: const Key('team-garment-other'),
                          controller: _otherGarment,
                          maxLength: 60,
                          decoration: const InputDecoration(
                            hintText: 'Something else, e.g. Socks',
                            counterText: '',
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton(
                        onPressed: () {
                          final v = _otherGarment.text.trim();
                          if (v.isNotEmpty && !_garments.contains(v)) {
                            toggle(v);
                          }
                          _otherGarment.clear();
                        },
                        child: const Text('Add'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  GradientButton(
                    label: 'DONE',
                    compact: true,
                    onPressed: () => Navigator.of(sheet).pop(),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
    field.didChange(List.of(_garments));
    if (mounted) setState(() {});
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final picked = await showDatePicker(
      context: context,
      initialDate: _date ?? today.add(const Duration(days: 28)),
      firstDate: today,
      lastDate: today.add(const Duration(days: 730)),
      helpText: 'Preferred delivery date',
    );
    if (picked != null && mounted) setState(() => _date = picked);
  }

  /// A first guess (the name or the type), changeable per file.
  String _guessKind(String name) {
    final ext = _ext(name);
    final logos = _files.where((f) => f.kind == 'logo').length;
    final logoish =
        RegExp(
          r'logo|crest|badge|emblem|sponsor',
          caseSensitive: false,
        ).hasMatch(name) ||
        const ['svg', 'ai', 'eps'].contains(ext);
    return logoish && logos < 5 && teamLogoTypes.contains(ext)
        ? 'logo'
        : 'reference';
  }

  Future<void> _addFiles() async {
    final picked = await pickTeamFiles('files');
    if (!mounted || picked.isEmpty) return;
    String? problem;
    setState(() {
      for (final f in picked) {
        final ext = _ext(f.name);
        final logos = _files.where((x) => x.kind == 'logo').length;
        final refs = _files.where((x) => x.kind == 'reference').length;
        var kind = _guessKind(f.name);
        if (kind == 'reference' && refs >= 10 && teamLogoTypes.contains(ext)) {
          kind = 'logo';
        }
        if (!teamReferenceTypes.contains(ext)) {
          problem = '${f.name}: this file type is not accepted.';
        } else if (f.bytes.length > 20 * 1024 * 1024) {
          problem = '${f.name} is over 20 MB.';
        } else if ((kind == 'logo' && logos >= 5) ||
            (kind == 'reference' && refs >= 10)) {
          problem = 'Up to 5 logos and 10 other files per request.';
        } else {
          _files.add((pick: f, kind: kind));
        }
      }
      _error = problem;
    });
  }

  void _setKind(int i, bool logo) {
    final count = _files
        .where((f) => f.kind == (logo ? 'logo' : 'reference'))
        .length;
    if (count >= (logo ? 5 : 10)) {
      setState(
        () => _error = logo
            ? 'Up to 5 logos per request.'
            : 'Up to 10 artwork and inspiration files per request.',
      );
      return;
    }
    setState(() {
      _files[i] = (pick: _files[i].pick, kind: logo ? 'logo' : 'reference');
      _error = null;
    });
  }

  void _toggleColour(String c) => setState(() {
    if (_colours.contains(c)) {
      _colours.remove(c);
    } else if (_colours.length < 8) {
      _colours.add(c);
    }
  });

  Future<void> _send() async {
    setState(() => _error = null);
    if (!_form.currentState!.validate()) return;
    if (!widget.c.signedIn) return _signIn(context, widget.c);
    final size = _files.fold<int>(0, (a, f) => a + f.pick.bytes.length);
    if (size > 100 * 1024 * 1024) {
      setState(
        () => _error =
            'Your files add up to more than 100 MB, the limit per request.',
      );
      return;
    }
    setState(() => _busy = true);
    try {
      final group = _sports.where((s) => s.id == _sport).firstOrNull?.group;
      final r = await widget.c.api.createTeamRequest(
        {
          'name': _name.text.trim(),
          'email': _email.text.trim(),
          'sport': _sport!,
          'garment': _garments.first,
          if (_date != null) 'preferred_date': _isoDate(_date!),
          if (group != null)
            'category': group == 'apparel' ? 'Apparel' : 'Sports',
          'description': _description.text.trim(),
          if (_instructions.text.trim().isNotEmpty)
            'instructions': _instructions.text.trim(),
        },
        garments: _garments,
        colours: _colours,
        logos: [
          for (final f in _files)
            if (f.kind == 'logo') f.pick,
        ],
        references: [
          for (final f in _files)
            if (f.kind == 'reference') f.pick,
        ],
        idempotencyKey: _key,
      );
      if (!mounted) return;
      setState(() => _sent = r);
      widget.onSent?.call();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _another() => setState(() {
    _sent = null;
    _description.clear();
    _instructions.clear();
    _files.clear();
    _colours.clear();
    _garments.clear();
    _date = null;
    _key = _newKey();
  });

  Future<void> _pay(Map invoice) async {
    try {
      final url = await widget.c.api.invoicePayLink(
        '${invoice['invoice_number']}',
      );
      if (!mounted) return;
      await openPayPage(context, url, 'Pay now');
    } on ApiException catch (e) {
      if (mounted) showToast(context, e.message);
    }
  }

  /// What this request costs, from the allowance API (nothing hard-coded).
  (IconData, Color, String) get _cost {
    const included = Color(0xffbff0cf);
    final a = widget.allowance;
    if (!widget.c.signedIn) {
      return (
        Icons.info_outline,
        Palette.muted,
        'You sign in when you send; you see any fee before work begins.',
      );
    }
    if (a == null) {
      return (Icons.hourglass_empty, Palette.muted, 'Checking your plan…');
    }
    final next = (a['next_request'] as Map?) ?? const {};
    if (next['billing'] == 'paid') {
      return (
        Icons.credit_card,
        const Color(0xfff7dba6),
        'This request: ${_money(next['total'] ?? next['price'], next['currency'])} incl. ${next['tax_name'] ?? 'GST'} design fee${next['pay_first'] == false ? '. An invoice is issued when you send.' : ', paid before work begins.'}',
      );
    }
    if (next['billing'] == 'free' || a['unlimited'] == true) {
      return (Icons.check, included, 'No design fee on your plan.');
    }
    final plan = '${a['plan_name'] ?? a['plan'] ?? ''}';
    final left = a['remaining_included'];
    return (
      Icons.check,
      included,
      'Included in your plan${plan.isEmpty ? '' : ' ($plan)'}${left == null ? '.' : ': $left left this month.'}',
    );
  }

  InputDecoration _dec(String label, {String? hint}) =>
      InputDecoration(labelText: label, hintText: hint);

  @override
  Widget build(BuildContext context) {
    _tell();
    return _sent != null ? _confirmation(_sent!) : _formView();
  }

  Widget _confirmation(Map<String, dynamic> r) {
    final invoice = r['invoice'] as Map?;
    final mustPay = r['status'] == 'awaiting_payment' && invoice != null;
    final paid = r['billing'] == 'paid';
    final tone = paid ? const Color(0xfff7dba6) : const Color(0xffbff0cf);
    final fee = paid
        ? '${_incl(invoice?['total'] ?? r['price'], r['currency'])} design fee'
        : r['billing'] == 'free'
        ? 'No design fee'
        : 'Included in your plan';
    return SurfaceCard(
      child: Column(
        children: [
          const SizedBox(height: 8),
          const Icon(Icons.check_circle_outline, size: 54, color: Palette.cyan),
          const SizedBox(height: 12),
          const Text(
            'SENT TO 3DEEZI DESIGN TEAM',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Palette.cyan,
              fontWeight: FontWeight.w800,
              letterSpacing: 2,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Your reference: ${r['number']}',
            key: const Key('team-ref'),
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontFamily: 'Rajdhani',
              fontSize: 26,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 10),
          Container(
            key: const Key('team-fee'),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(30),
              color: paid ? const Color(0x662a1e0a) : const Color(0x660a2a18),
              border: Border.all(
                color: paid ? const Color(0x66f5b547) : const Color(0x6622c55e),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  paid ? Icons.credit_card : Icons.check,
                  size: 16,
                  color: tone,
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Text(
                    fee,
                    style: TextStyle(fontWeight: FontWeight.w700, color: tone),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Text(
            mustPay
                ? 'Pay invoice ${invoice['invoice_number']} and your designer starts straight away.'
                : 'We have your brief. A designer will be assigned shortly; you get a notification at each step.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: Palette.muted, height: 1.5),
          ),
          const SizedBox(height: 18),
          if (mustPay) ...[
            GradientButton(
              label: 'PAY NOW',
              icon: Icons.credit_card,
              onPressed: () => _pay(invoice),
            ),
            const SizedBox(height: 10),
          ],
          SecondaryButton(
            label: 'View request',
            icon: Icons.arrow_forward,
            onPressed: () =>
                widget.onViewRequest?.call((r['id'] as num).toInt()),
          ),
          if (!mustPay) ...[
            const SizedBox(height: 4),
            TextButton(
              onPressed: _another,
              child: const Text('Send another request'),
            ),
          ],
        ],
      ),
    );
  }

  Widget _uploadBox() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      InkWell(
        key: const Key('team-upload'),
        onTap: _addFiles,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xff061423),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0x6612e1f0), width: 1.5),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Row(
                children: [
                  Icon(Icons.upload_outlined, color: Palette.cyan, size: 28),
                  SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Upload logos, artwork & inspiration',
                          style: TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 13.5,
                          ),
                        ),
                        SizedBox(height: 2),
                        Text(
                          'Tap to browse your files',
                          style: TextStyle(color: Palette.muted, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: _addFiles,
                icon: const Icon(Icons.attach_file, size: 18),
                label: const Text('Add files'),
              ),
            ],
          ),
        ),
      ),
      const SizedBox(height: 6),
      const Text(
        'Up to 5 logos (PNG, JPG, SVG, PDF, AI, EPS) and 10 other files (pictures, PDF, Word, PowerPoint, ZIP), 20 MB each.',
        style: TextStyle(color: Palette.muted, fontSize: 11),
      ),
      for (final (i, f) in _files.indexed)
        ListTile(
          dense: true,
          contentPadding: EdgeInsets.zero,
          leading: Icon(
            f.kind == 'logo'
                ? Icons.image_outlined
                : Icons.insert_drive_file_outlined,
            color: Palette.cyan,
          ),
          title: Text(f.pick.name, overflow: TextOverflow.ellipsis),
          subtitle: Text(
            '${(f.pick.bytes.length / 1024).ceil()} KB · ${f.kind == 'logo' ? 'Logo' : 'Artwork & inspiration'}',
            style: const TextStyle(fontSize: 11),
          ),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (teamLogoTypes.contains(_ext(f.pick.name)))
                FilterChip(
                  key: Key('team-logo-${f.pick.name}'),
                  label: const Text('Logo'),
                  selected: f.kind == 'logo',
                  visualDensity: VisualDensity.compact,
                  onSelected: (on) => _setKind(i, on),
                ),
              IconButton(
                tooltip: 'Remove ${f.pick.name}',
                icon: const Icon(Icons.close, size: 18),
                onPressed: () => setState(() => _files.removeAt(i)),
              ),
            ],
          ),
        ),
    ],
  );

  /// Brand colours and extra instructions: optional, folded (not in the
  /// client's form, kept so nothing that worked before is lost).
  Widget _moreDetails() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      TextButton.icon(
        key: const Key('team-more'),
        onPressed: () => setState(() => _more = !_more),
        style: TextButton.styleFrom(
          padding: EdgeInsets.zero,
          foregroundColor: const Color(0xff9fd8e6),
        ),
        icon: Icon(_more ? Icons.expand_less : Icons.add, size: 18),
        label: const Text('Add brand colours or extra instructions (optional)'),
      ),
      if (_more) ...[
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final hex in _swatches)
              Semantics(
                button: true,
                selected: _colours.contains(hex),
                label: 'Colour $hex',
                child: InkWell(
                  key: Key('swatch-$hex'),
                  customBorder: const CircleBorder(),
                  onTap: () => _toggleColour(hex),
                  child: Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: _hexColour(hex),
                      border: Border.all(
                        color: _colours.contains(hex)
                            ? Palette.cyan
                            : Colors.white24,
                        width: _colours.contains(hex) ? 3 : 1.5,
                      ),
                    ),
                    child: _colours.contains(hex)
                        ? const Icon(
                            Icons.check,
                            size: 16,
                            color: Colors.white,
                            shadows: [Shadow(blurRadius: 3)],
                          )
                        : null,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _hex,
                decoration: _dec('Any colour', hint: '#0a2342 or navy'),
              ),
            ),
            const SizedBox(width: 8),
            OutlinedButton(
              onPressed: () {
                final v = _hex.text.trim();
                if (v.isEmpty || v.length > 40) return;
                _toggleColour(
                  v.startsWith('#') || _hexColour(v) == null ? v : '#$v',
                );
                _hex.clear();
              },
              child: const Text('Add'),
            ),
          ],
        ),
        if (_colours.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final col in _colours)
                  InputChip(
                    avatar: CircleAvatar(
                      backgroundColor: _hexColour(col) ?? Palette.surface2,
                    ),
                    label: Text(col),
                    onDeleted: () => _toggleColour(col),
                  ),
              ],
            ),
          ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _instructions,
          decoration: _dec(
            'Extra instructions',
            hint: 'Quantities and sizes, sponsors, names and numbers…',
          ),
          minLines: 2,
          maxLines: 5,
          maxLength: 4000,
        ),
      ],
    ],
  );

  Widget _formView() {
    final a = widget.allowance;
    final blocked = a?['can_submit'] == false;
    String? required(String? v) =>
        (v == null || v.trim().isEmpty) ? 'Required' : null;
    final (costIcon, costColor, costText) = _cost;
    return SurfaceCard(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
      child: Form(
        key: _form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Row(
              children: [
                Icon(
                  Icons.design_services_outlined,
                  size: 15,
                  color: Palette.cyan,
                ),
                SizedBox(width: 8),
                Text(
                  'REQUEST A DESIGNER',
                  style: TextStyle(
                    color: Palette.cyan,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 2.4,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            const Text(
              'Tell us what you need',
              style: TextStyle(
                fontFamily: 'Rajdhani',
                fontSize: 24,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 14),
            TextFormField(
              key: const Key('team-name'),
              controller: _name,
              decoration: _dec(
                'Company / team name',
                hint: 'e.g. Your Club, School or Business',
              ),
              inputFormatters: [LengthLimitingTextInputFormatter(120)],
              validator: required,
            ),
            const SizedBox(height: 14),
            TextFormField(
              key: const Key('team-email'),
              controller: _email,
              decoration: _dec('Contact email', hint: 'you@yourdomain.com'),
              keyboardType: TextInputType.emailAddress,
              validator: (v) =>
                  required(v) ??
                  (v!.contains('@') ? null : 'Enter an email address'),
            ),
            const SizedBox(height: 14),
            DropdownButtonFormField<String>(
              key: const Key('team-sport'),
              initialValue: _sport,
              isExpanded: true,
              decoration: _dec('Sport / activity'),
              hint: const Text('Select a sport'),
              items: [
                for (final s in _sports)
                  DropdownMenuItem(
                    value: s.id,
                    child: Text(
                      s.group == 'apparel' ? '${s.name} (apparel)' : s.name,
                    ),
                  ),
              ],
              onChanged: (v) => setState(() => _sport = v),
              validator: required,
            ),
            const SizedBox(height: 14),
            FormField<List<String>>(
              key: const Key('team-garments'),
              validator: (_) =>
                  _garments.isEmpty ? 'Choose at least one garment.' : null,
              builder: (field) => InkWell(
                onTap: () => _pickGarments(field),
                borderRadius: BorderRadius.circular(8),
                child: InputDecorator(
                  decoration: _dec('Garments needed').copyWith(
                    errorText: field.errorText,
                    suffixIcon: const Icon(Icons.expand_more),
                  ),
                  child: Text(
                    _garments.isEmpty
                        ? 'e.g. Jerseys, Shorts, Tracksuits…'
                        : _garments.map(_garmentName).join(', '),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: _garments.isEmpty ? Palette.muted : Palette.text,
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 14),
            TextFormField(
              key: const Key('team-description'),
              controller: _description,
              decoration: _dec(
                'Design brief',
                hint: 'Tell us about your colours, style, logos and ideas…',
              ),
              minLines: 3,
              maxLines: 8,
              maxLength: 4000,
              validator: (v) => (v ?? '').trim().length < 10
                  ? 'Describe your design in a few words (10 characters or more).'
                  : null,
            ),
            const SizedBox(height: 4),
            _uploadBox(),
            const SizedBox(height: 14),
            InkWell(
              key: const Key('team-date'),
              onTap: _pickDate,
              borderRadius: BorderRadius.circular(8),
              child: InputDecorator(
                decoration: _dec('Preferred delivery date (optional)').copyWith(
                  suffixIcon: _date == null
                      ? const Icon(Icons.calendar_month_outlined)
                      : IconButton(
                          tooltip: 'Clear the date',
                          icon: const Icon(Icons.close, size: 18),
                          onPressed: () => setState(() => _date = null),
                        ),
                ),
                child: Text(
                  _date == null
                      ? 'Let us know if you have a target date'
                      : '${_date!.day} ${const ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][_date!.month - 1]} ${_date!.year}',
                  style: TextStyle(
                    color: _date == null ? Palette.muted : Palette.text,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            _moreDetails(),
            const SizedBox(height: 8),
            Row(
              key: const Key('team-cost'),
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(costIcon, size: 17, color: costColor),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    costText,
                    style: TextStyle(
                      color: costColor,
                      fontSize: 12.5,
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
            if (blocked)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  '${a?['blocked_reason'] ?? ''}',
                  style: const TextStyle(color: Color(0xfff7dba6)),
                ),
              ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  _error!,
                  style: const TextStyle(color: Color(0xffff8b9b)),
                ),
              ),
            const SizedBox(height: 12),
            _busy
                ? const Center(child: CircularProgressIndicator())
                : GradientButton(
                    label: 'SEND DESIGN REQUEST',
                    icon: Icons.arrow_forward,
                    onPressed: blocked ? null : _send,
                  ),
          ],
        ),
      ),
    );
  }
}

/// The request form on its own screen (the TEAM screen shows it inline).
class TeamRequestFormScreen extends StatelessWidget {
  const TeamRequestFormScreen(this.c, {super.key, this.allowance});
  final AppController c;
  final Map<String, dynamic>? allowance;
  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Palette.bg,
    body: SafeArea(
      child: Column(
        children: [
          TopBar(
            onBack: () => Navigator.of(context).maybePop(),
            title: 'REQUEST A DESIGNER',
          ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
              child: TeamRequestForm(
                c,
                allowance: allowance,
                onViewRequest: (id) => Navigator.of(context).pop(id),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

// ---------------------------------------------------------------- one request

class TeamRequestScreen extends StatefulWidget {
  const TeamRequestScreen(this.c, this.id, {super.key});
  final AppController c;
  final int id;
  @override
  State<TeamRequestScreen> createState() => _TeamRequestScreenState();
}

class _TeamRequestScreenState extends State<TeamRequestScreen> {
  Map<String, dynamic>? _r;
  String? _error;
  String _busy = '';
  int? _version;
  final _message = TextEditingController();
  final _attach = <TeamPick>[];
  final _messageFocus = FocusNode();

  AppController get c => widget.c;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _message.dispose();
    _messageFocus.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final r = await c.api.teamRequest(widget.id);
      if (mounted) setState(() => _r = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _act(String name, Future<void> Function() run) async {
    setState(() => _busy = name);
    try {
      await run();
    } on ApiException catch (e) {
      if (mounted) showToast(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = '');
    }
  }

  Future<void> _sendMessage() async {
    final text = _message.text.trim();
    if (text.isEmpty && _attach.isEmpty) return;
    await _act('message', () async {
      await c.api.teamMessage(widget.id, text, files: List.of(_attach));
      _message.clear();
      _attach.clear();
      await _load();
    });
  }

  Future<void> _revise({bool extra = false}) async {
    // Not disposed here: the sheet may still be closing (it is garbage collected).
    final note = TextEditingController();
    final files = <TeamPick>[];
    final ok = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Palette.surface,
      builder: (sheet) => StatefulBuilder(
        builder: (sheet, set) => Padding(
          padding: EdgeInsets.fromLTRB(
            16,
            16,
            16,
            16 + MediaQuery.of(sheet).viewInsets.bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      extra ? 'Extra revision' : 'Request revisions',
                      style: const TextStyle(
                        fontFamily: 'Rajdhani',
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  IconButton(
                    key: const ValueKey('sheet-close'),
                    tooltip: 'Close',
                    visualDensity: VisualDensity.compact,
                    onPressed: () => Navigator.pop(sheet, false),
                    icon: const Icon(Icons.close, color: Palette.text),
                  ),
                ],
              ),
              if (extra)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    'An extra revision round is ${_incl(((_r?['extra_revision_price'] as Map?) ?? const {})['price'] ?? '25.00', 'AUD')}. You pay its invoice next; your designer starts once it is paid.',
                    style: const TextStyle(
                      color: Color(0xfff7dba6),
                      fontSize: 12,
                    ),
                  ),
                ),
              const SizedBox(height: 10),
              TextField(
                key: const Key('team-revision'),
                controller: note,
                minLines: 3,
                maxLines: 6,
                decoration: const InputDecoration(
                  labelText: 'What should change?',
                  hintText: 'e.g. Make the stripes thinner',
                ),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () async {
                  final picked = await pickTeamFiles('files');
                  set(
                    () => files.addAll(
                      picked
                          .where(
                            (f) => teamReferenceTypes.contains(_ext(f.name)),
                          )
                          .take(5 - files.length),
                    ),
                  );
                },
                icon: const Icon(Icons.attach_file),
                label: Text(
                  files.isEmpty
                      ? 'Add pictures or notes'
                      : '${files.length} file${files.length == 1 ? '' : 's'} added',
                ),
              ),
              const SizedBox(height: 12),
              GradientButton(
                label: extra ? 'SEND AND PAY' : 'SEND REVISIONS',
                icon: Icons.send,
                onPressed: () => Navigator.pop(sheet, true),
              ),
            ],
          ),
        ),
      ),
    );
    if (ok != true || note.text.trim().length < 3) {
      return;
    }
    final text = note.text.trim();
    await _act('revise', () async {
      final r = await c.api.teamRevise(
        widget.id,
        text,
        files: files,
        extra: extra,
      );
      if (mounted) setState(() => _r = r);
      final invoice = (r['pending_revision'] as Map?)?['invoice'] as Map?;
      if (!mounted) return;
      if (extra && invoice != null) {
        showToast(
          context,
          'Extra revision: pay invoice ${invoice['invoice_number']} and your designer starts it.',
        );
      } else {
        showToast(context, 'Revision request sent to your designer.');
      }
    });
    // The existing PAY NOW path (outside _act, which is busy until the call returns).
    final invoice = (_r?['pending_revision'] as Map?)?['invoice'] as Map?;
    if (extra && invoice != null && mounted) await _pay(invoice);
  }

  Future<void> _approve(int? version) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text('Approve version ${version ?? ''}?'),
        content: const Text(
          'Your final design is saved in your assets, ready to open in 3D or to order.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(d, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(d, true),
            child: const Text('Approve'),
          ),
        ],
      ),
    );
    if (yes != true) return;
    await _act('approve', () async {
      final r = await c.api.teamApprove(widget.id, version: version);
      if (mounted) setState(() => _r = r);
      if (mounted)
        showToast(
          context,
          '${r['number']} approved. Your design is in your assets.',
        );
    });
  }

  /// "Open in 3D Designer": the approved design on the 3D kit as drawn (the
  /// AI designer's "Put my design on the 3D kit" path).
  Future<void> _toStudio() async {
    await _act('studio', () async {
      final asset = await c.api.teamToStudio(widget.id);
      final bytes = await c.api.downloadTeamFile('${asset['url']}');
      final ext = bytes.length > 3 && bytes[0] == 0x89 && bytes[1] == 0x50
          ? 'png'
          : bytes.length > 2 && bytes[0] == 0xff && bytes[1] == 0xd8
          ? 'jpg'
          : bytes.length > 11 &&
                ascii.decode(bytes.sublist(8, 12), allowInvalid: true) == 'WEBP'
          ? 'webp'
          : 'png';
      if (!mounted) return;
      final root = Navigator.of(context, rootNavigator: true).context;
      Navigator.of(context).popUntil((r) => r.isFirst);
      // The request's garment (the website does the same), so the check
      // screen starts on it.
      final garment = switch ('${asset['garment'] ?? _r?['garment'] ?? ''}') {
        'jersey' => 'Jersey',
        'tee' => 'Training Tee',
        'polo' => 'Polo',
        'singlet' => 'Singlet',
        _ => null,
      };
      if (garment != null) c.update(() => c.garment = garment);
      c.go(AppScreen.studio);
      for (var t = 0; t < 100 && c.checkLayout == null; t++) {
        await Future<void>.delayed(const Duration(milliseconds: 200));
      }
      try {
        final done = await c.importDesignPicture(
          '${_r?['number'] ?? 'TEAM'}.$ext',
          bytes,
        );
        if (done != null && root.mounted) showToast(root, done);
      } on Object catch (e) {
        if (root.mounted)
          showToast(
            root,
            e is ApiException
                ? e.message
                : 'That design could not go on the 3D kit.',
          );
      }
    });
  }

  Future<void> _order() async {
    await _act('order', () async {
      final r = await c.api.teamOrderDraft(widget.id);
      if (!mounted) return;
      await openSitePage(
        context,
        c.api.sitePage('${r['link'] ?? '/orders/new?draft=${r['draft_id']}'}'),
        'Order this design',
      );
    });
  }

  Future<void> _pay(Map invoice) async {
    await _act('pay', () async {
      final url = await c.api.invoicePayLink('${invoice['invoice_number']}');
      if (!mounted) return;
      await openPayPage(context, url, 'Pay now');
      await _load();
    });
  }

  Future<void> _cancel() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text('Cancel ${_r?['number']}?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(d, false),
            child: const Text('Keep it'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(d, true),
            child: const Text('Cancel request'),
          ),
        ],
      ),
    );
    if (yes != true) return;
    await _act('cancel', () async {
      final r = await c.api.teamCancel(widget.id);
      if (mounted) setState(() => _r = r);
    });
  }

  @override
  Widget build(BuildContext context) {
    final r = _r;
    return Scaffold(
      backgroundColor: Palette.bg,
      body: SafeArea(
        child: Column(
          children: [
            TopBar(
              onBack: () => Navigator.of(context).maybePop(),
              title: r == null ? '3DEEZI TEAM' : '${r['number']}',
              subtitle: r == null
                  ? null
                  : '${teamGarmentsText(r)} · ${r['sport_name'] ?? r['sport']}',
            ),
            Expanded(
              child: r == null
                  ? Center(
                      child: _error != null
                          ? Text(
                              _error!,
                              style: const TextStyle(color: Color(0xffff8b9b)),
                            )
                          : const CircularProgressIndicator(),
                    )
                  : RefreshIndicator(onRefresh: _load, child: _body(r)),
            ),
            if (r != null && (r['can'] as Map?)?['message'] == true) _compose(),
          ],
        ),
      ),
    );
  }

  Widget _body(Map<String, dynamic> r) {
    final can = (r['can'] as Map?) ?? const {};
    final deliveries =
        ((r['deliveries'] as List?) ?? const []).cast<Map>().toList()..sort(
          (a, b) => ((b['version'] as num?) ?? 0).compareTo(
            (a['version'] as num?) ?? 0,
          ),
        );
    final shown =
        deliveries
            .where((d) => d['version'] == (_version ?? r['latest_version']))
            .firstOrNull ??
        deliveries.firstOrNull;
    final final_ = r['final'] as Map?;
    final invoice = r['invoice'] as Map?;
    final pendingInvoice = (r['pending_revision'] as Map?)?['invoice'] as Map?;
    final extraPrice =
        ((r['extra_revision_price'] as Map?) ?? const {})['price'];
    final used = (r['revisions_used'] as num?)?.toInt() ?? 0;
    final allowed = (r['revisions_allowed'] as num?)?.toInt() ?? 0;
    final messages = ((r['messages'] as List?) ?? const []).cast<Map>();
    final busy = _busy.isNotEmpty;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
      children: [
        Row(
          children: [
            TeamStatusChip(r),
            const Spacer(),
            if (r['designer'] != null)
              Text(
                'Designer ${(r['designer'] as Map)['name']}',
                style: const TextStyle(color: Palette.muted, fontSize: 12),
              ),
          ],
        ),
        const SizedBox(height: 10),
        TeamStepsBar(r),
        if (r['due_date'] != null &&
            const [
              'received',
              'assigned',
              'in_progress',
              'revision',
            ].contains(r['status'])) ...[
          const SizedBox(height: 8),
          Row(
            key: const Key('team-due'),
            children: [
              const Icon(
                Icons.event_available_outlined,
                size: 16,
                color: Palette.cyan,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  '${r['status'] == 'revision'
                      ? 'Revision'
                      : ((r['latest_version'] as num?) ?? 0) > 0
                      ? 'Next design'
                      : 'First design'} due by ${_day(r['due_date'])}',
                  style: const TextStyle(
                    color: Color(0xffbff7ff),
                    fontSize: 13,
                  ),
                ),
              ),
            ],
          ),
        ],
        if (r['refund_status'] != null) ...[
          const SizedBox(height: 8),
          Text(
            r['refund_status'] == 'refunded'
                ? 'Refunded in full.'
                : 'Cancelled before work started: your full refund is being processed.',
            key: const Key('team-refund'),
            style: const TextStyle(color: Color(0xffc9f5da), fontSize: 13),
          ),
        ],
        if (pendingInvoice != null) ...[
          const SizedBox(height: 10),
          Text(
            'Extra revision: invoice ${pendingInvoice['invoice_number']}, ${_incl(pendingInvoice['amount_due'] ?? pendingInvoice['total'], r['currency'])}. Your designer starts the revision once it is paid.',
            style: const TextStyle(color: Color(0xfff7dba6), fontSize: 13),
          ),
          if (can['pay_revision'] == true) ...[
            const SizedBox(height: 8),
            GradientButton(
              key: const Key('team-pay-revision'),
              label: 'PAY NOW',
              icon: Icons.credit_card,
              onPressed: busy ? null : () => _pay(pendingInvoice),
            ),
          ],
        ],
        if (can['pay'] == true && invoice != null) ...[
          const SizedBox(height: 10),
          GradientButton(
            label:
                'PAY ${_money(invoice['amount_due'] ?? invoice['total'] ?? r['price'], r['currency'])}',
            icon: Icons.credit_card,
            onPressed: busy ? null : () => _pay(invoice),
          ),
        ],
        if (final_ != null) ...[
          const SizedBox(height: 16),
          const SectionLabel('Final design'),
          const SizedBox(height: 6),
          Text(
            'Approved ${_day(final_['approved_at'])}. It is saved in your assets.',
            style: const TextStyle(color: Color(0xffbff0cf)),
          ),
          const SizedBox(height: 8),
          for (final f
              in ((final_['files'] as List?) ?? const []).cast<Map>().where(
                (f) => f['is_image'] == true,
              ))
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _TeamImage(c, f),
            ),
          if (can['to_studio'] == true)
            GradientButton(
              label: 'OPEN IN 3D DESIGNER',
              icon: Icons.view_in_ar_outlined,
              onPressed: busy ? null : _toStudio,
            ),
          const SizedBox(height: 8),
          if (can['order'] == true)
            SecondaryButton(
              label: 'Order this design',
              icon: Icons.shopping_bag_outlined,
              onPressed: busy ? null : _order,
            ),
        ],
        const SizedBox(height: 16),
        SectionLabel(
          r['status'] == 'review' ? 'Ready for your review' : 'Designs',
        ),
        Wrap(
          children: [
            for (final d in deliveries)
              Padding(
                padding: const EdgeInsets.only(left: 6),
                child: ChoiceChip(
                  label: Text('V${d['version']}'),
                  selected: d == shown,
                  onSelected: (_) =>
                      setState(() => _version = (d['version'] as num).toInt()),
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        if (shown == null)
          const Text(
            'Your designer’s designs appear here for you to review. You get a notification when they are ready.',
            style: TextStyle(color: Palette.muted),
          )
        else ...[
          for (final f in ((shown['files'] as List?) ?? const []).cast<Map>())
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: f['is_image'] == true ? _TeamImage(c, f) : _FileRow(c, f),
            ),
          if (shown['note'] != null)
            Text(
              '${shown['note']}',
              style: const TextStyle(color: Palette.muted),
            ),
        ],
        if (r['status'] == 'review' && shown != null) ...[
          const SizedBox(height: 12),
          GradientButton(
            label: 'APPROVE V${shown['version']}',
            icon: Icons.check,
            onPressed: busy || can['approve'] != true
                ? null
                : () => _approve((shown['version'] as num?)?.toInt()),
          ),
          const SizedBox(height: 8),
          if (can['extra_revision'] == true)
            SecondaryButton(
              key: const Key('team-extra-revision'),
              label:
                  'Extra revision ${_money(extraPrice ?? '25.00', r['currency'])}',
              icon: Icons.refresh,
              onPressed: busy ? null : () => _revise(extra: true),
            )
          else
            SecondaryButton(
              label: 'Request revisions',
              icon: Icons.refresh,
              onPressed: busy || can['revise'] != true || used >= allowed
                  ? null
                  : _revise,
            ),
          const SizedBox(height: 8),
          SecondaryButton(
            label: 'Message',
            icon: Icons.chat_bubble_outline,
            onPressed: () => _messageFocus.requestFocus(),
          ),
          const SizedBox(height: 6),
          Text(
            used < allowed
                ? '${allowed - used} of $allowed revision${allowed == 1 ? '' : 's'} left'
                : pendingInvoice != null
                ? 'Extra revision waiting for payment.'
                : can['extra_revision'] == true
                ? 'Your included revisions are used: an extra round is ${_incl(extraPrice ?? '25.00', r['currency'])}.'
                : 'No revisions left: message your designer or approve the design.',
            style: const TextStyle(color: Palette.muted, fontSize: 12),
          ),
        ],
        const SizedBox(height: 18),
        const SectionLabel('Conversation'),
        const SizedBox(height: 8),
        if (messages.isEmpty)
          const Text(
            'No messages yet. Ask your designer anything here.',
            style: TextStyle(color: Palette.muted),
          ),
        for (final m in messages) _Bubble(c, m),
        const SizedBox(height: 18),
        const SectionLabel('Your brief'),
        const SizedBox(height: 6),
        if (r['preferred_date'] != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(
              key: const Key('team-preferred'),
              children: [
                const Icon(
                  Icons.calendar_month_outlined,
                  size: 16,
                  color: Palette.cyan,
                ),
                const SizedBox(width: 8),
                Text('Wanted by ${_day(r['preferred_date'])}'),
              ],
            ),
          ),
        Text('${r['description'] ?? ''}', style: const TextStyle(height: 1.5)),
        if (((r['colours'] as List?) ?? const []).isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Wrap(
              spacing: 6,
              children: [
                for (final col in (r['colours'] as List))
                  Chip(
                    avatar: CircleAvatar(
                      backgroundColor: _hexColour('$col') ?? Palette.surface2,
                    ),
                    label: Text('$col'),
                  ),
              ],
            ),
          ),
        for (final f in ((r['files'] as List?) ?? const []).cast<Map>())
          _FileRow(c, f),
        if (can['cancel'] == true)
          TextButton.icon(
            onPressed: busy ? null : _cancel,
            icon: const Icon(Icons.close),
            label: const Text('Cancel this request'),
          ),
      ],
    );
  }

  Widget _compose() => Container(
    padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
    decoration: const BoxDecoration(
      color: Palette.surface,
      border: Border(top: BorderSide(color: Palette.border)),
    ),
    child: Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (_attach.isNotEmpty)
          Wrap(
            spacing: 6,
            children: [
              for (final (i, f) in _attach.indexed)
                InputChip(
                  label: Text(f.name),
                  onDeleted: () => setState(() => _attach.removeAt(i)),
                ),
            ],
          ),
        Row(
          children: [
            IconButton(
              tooltip: 'Attach files',
              onPressed: () async {
                final picked = await pickTeamFiles('files');
                if (mounted)
                  setState(
                    () => _attach.addAll(
                      picked
                          .where(
                            (f) => teamReferenceTypes.contains(_ext(f.name)),
                          )
                          .take(5 - _attach.length),
                    ),
                  );
              },
              icon: const Icon(Icons.attach_file),
            ),
            Expanded(
              child: TextField(
                key: const Key('team-message'),
                controller: _message,
                focusNode: _messageFocus,
                minLines: 1,
                maxLines: 4,
                decoration: const InputDecoration(
                  hintText: 'Message your designer…',
                  contentPadding: EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 10,
                  ),
                ),
              ),
            ),
            IconButton(
              tooltip: 'Send',
              onPressed: _busy == 'message' ? null : _sendMessage,
              icon: const Icon(Icons.send, color: Palette.cyan),
            ),
          ],
        ),
      ],
    ),
  );
}

class _Bubble extends StatelessWidget {
  const _Bubble(this.c, this.m);
  final AppController c;
  final Map m;
  @override
  Widget build(BuildContext context) {
    final mine = m['role'] == 'customer';
    final system = m['role'] == 'system';
    return Align(
      alignment: system
          ? Alignment.center
          : mine
          ? Alignment.centerRight
          : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 300),
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        decoration: BoxDecoration(
          color: system
              ? Colors.transparent
              : mine
              ? const Color(0xff123f55)
              : Palette.surface2,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!mine && !system)
              Text(
                '${(m['author'] as Map?)?['name'] ?? '3DEEZI TEAM'} · ${m['role'] == 'admin' ? '3DEEZI' : 'Designer'}',
                style: const TextStyle(
                  color: Palette.cyan,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            if ((m['body'] ?? '').toString().isNotEmpty)
              Text(
                '${m['body']}',
                style: TextStyle(color: system ? Palette.muted : Palette.text),
              ),
            for (final f in ((m['files'] as List?) ?? const []).cast<Map>())
              _FileRow(c, f),
            Text(
              _day(m['created_at']),
              style: const TextStyle(color: Palette.muted, fontSize: 10),
            ),
          ],
        ),
      ),
    );
  }
}

/// A file: tap to open (pictures are shown, others open on the website).
class _FileRow extends StatelessWidget {
  const _FileRow(this.c, this.f);
  final AppController c;
  final Map f;
  @override
  Widget build(BuildContext context) => ListTile(
    dense: true,
    contentPadding: EdgeInsets.zero,
    leading: Icon(
      f['is_image'] == true
          ? Icons.image_outlined
          : Icons.insert_drive_file_outlined,
      color: Palette.cyan,
    ),
    title: Text('${f['name']}', overflow: TextOverflow.ellipsis),
    onTap: () async {
      if (f['is_image'] == true) {
        await showDialog<void>(
          context: context,
          builder: (_) => Dialog(child: _TeamImage(c, f)),
        );
        return;
      }
      try {
        final bytes = await c.api.downloadTeamFile('${f['url']}');
        if (context.mounted)
          showToast(
            context,
            '${f['name']} (${(bytes.length / 1024).ceil()} KB) downloaded. Open your request on the website to save it.',
          );
      } on ApiException catch (e) {
        if (context.mounted) showToast(context, e.message);
      }
    },
  );
}

/// A picture from the request (fetched with the sign-in token; the small
/// thumb shows until it arrives).
class _TeamImage extends StatefulWidget {
  const _TeamImage(this.c, this.f);
  final AppController c;
  final Map f;
  @override
  State<_TeamImage> createState() => _TeamImageState();
}

class _TeamImageState extends State<_TeamImage> {
  Uint8List? _bytes;
  @override
  void initState() {
    super.initState();
    final thumb = '${widget.f['thumb'] ?? ''}';
    if (thumb.startsWith('data:') && thumb.contains(',')) {
      try {
        _bytes = base64Decode(thumb.split(',').last);
      } on FormatException {
        _bytes = null;
      }
    }
    widget.c.api
        .downloadTeamFile('${widget.f['url']}')
        .then((b) {
          if (mounted) setState(() => _bytes = b);
        })
        .catchError((Object _) {});
  }

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(12),
    child: AspectRatio(
      aspectRatio: 4 / 3,
      child: ColoredBox(
        color: Palette.surface2,
        child: _bytes == null
            ? const Center(child: CircularProgressIndicator())
            : Image.memory(
                _bytes!,
                fit: BoxFit.contain,
                gaplessPlayback: true,
                errorBuilder: (_, _, _) =>
                    const Center(child: Icon(Icons.broken_image_outlined)),
              ),
      ),
    ),
  );
}
