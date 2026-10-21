import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api_client.dart';
import '../app_controller.dart';
import '../sports_catalog.dart';
import '../widgets/flow_ui.dart';
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

String _money(Object? amount, Object? currency) {
  final n = double.tryParse('$amount') ?? 0;
  return '${currency == null || currency == 'AUD' ? r'A$' : '$currency '}${n.toStringAsFixed(2)}';
}

/// TEAM prices include GST (client answers 2026-10-21).
String _incl(Object? amount, Object? currency) =>
    '${_money(amount, currency)} incl. GST';

/// The refund policy (client answers 2026-10-21), as on the website's /team.
const teamRefundPolicy =
    'Full refund if you cancel before your designer starts. No refund once the first draft is delivered, though 3DEEZI may give an account credit where fair. Full refund if 3DEEZI can’t deliver as promised.';

/// The turnaround promise, with the server's numbers when the plan is loaded.
String teamPromise(Map? allowance) {
  final t = (allowance?['turnaround'] as Map?) ?? const {};
  return 'First design within ${t['first_draft_days'] ?? 3} business days';
}

/// Prices, revisions, turnaround and refunds on the TEAM screen.
class TeamPolicyCard extends StatelessWidget {
  const TeamPolicyCard({super.key, this.allowance});
  final Map? allowance;

  @override
  Widget build(BuildContext context) {
    final t = (allowance?['turnaround'] as Map?) ?? const {};
    final extra = (allowance?['extra_revision'] as Map?)?['price'] ?? '25.00';
    final plans = ((allowance?['plans'] as List?) ?? const []).cast<Map>();
    final prices = plans.isEmpty
        ? r'Free A$99, Pro A$79, Premium A$69, Business A$49'
        : plans
              .map(
                (p) =>
                    '${'${p['name']}'.split(' / ').first} ${_money(p['price'], 'AUD')}',
              )
              .join(', ');
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
    return Container(
      key: const Key('team-policy'),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Palette.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0x4012e1f0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          row(
            Icons.credit_card,
            'Prices',
            'Premium 2 and Business 6 included a month (no carry-over). Each extra request: $prices, all incl. GST.',
          ),
          row(
            Icons.refresh,
            'Revisions',
            'Extra revision round ${_incl(extra, 'AUD')}, starts once paid.',
          ),
          row(
            Icons.event_available_outlined,
            'Turnaround',
            'First design within ${t['first_draft_days'] ?? 3} business days; each revision within ${t['revision_days'] ?? 2}.',
          ),
          row(Icons.verified_user_outlined, 'Refunds', teamRefundPolicy),
        ],
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

/// The 3DEEZI TEAM screen: heading, how it works, my allowance, REQUEST A
/// DESIGNER and my design requests.
class TeamScreen extends StatefulWidget {
  const TeamScreen(this.c, {super.key});
  final AppController c;
  @override
  State<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends State<TeamScreen> {
  Map<String, dynamic>? _allowance;
  List<Map<String, dynamic>>? _requests;
  int _unread = 0;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (!widget.c.signedIn) return;
    setState(() => _error = null);
    try {
      final results = await Future.wait([
        widget.c.api.teamAllowance(),
        widget.c.api.teamRequests(),
      ]);
      if (!mounted) return;
      setState(() {
        _allowance = results[0] as Map<String, dynamic>;
        _requests = results[1] as List<Map<String, dynamic>>;
      });
      final notes = await widget.c.api.notifications();
      final items = ((notes['items'] as List?) ?? const []).cast<Map>();
      if (mounted) {
        setState(
          () => _unread = items
              .where(
                (n) =>
                    n['read_at'] == null &&
                    (n['data'] as Map?)?['team_request_id'] != null,
              )
              .length,
        );
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _open(int id) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => TeamRequestScreen(widget.c, id)),
    );
    if (mounted) _load();
  }

  Future<void> _request() async {
    if (!widget.c.signedIn) return _signIn(context, widget.c);
    final sent = await Navigator.of(context).push<int>(
      MaterialPageRoute(
        builder: (_) => TeamRequestFormScreen(widget.c, allowance: _allowance),
      ),
    );
    if (!mounted) return;
    await _load();
    if (sent != null && mounted) unawaited(_open(sent));
  }

  Future<void> _bell() async {
    final opened = await showModalBottomSheet<int>(
      context: context,
      backgroundColor: Palette.surface,
      isScrollControlled: true,
      builder: (_) => TeamNotificationsSheet(widget.c),
    );
    if (!mounted) return;
    unawaited(_load());
    if (opened != null) unawaited(_open(opened));
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
                  IconButton(
                    tooltip: 'Notifications',
                    onPressed: _bell,
                    icon: Badge(
                      isLabelVisible: _unread > 0,
                      label: Text('$_unread'),
                      child: const Icon(Icons.notifications_outlined),
                    ),
                  ),
              ],
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
                  children: [
                    _TeamHero(onRequest: _request),
                    const SizedBox(height: 12),
                    Row(
                      key: const Key('team-promise'),
                      children: [
                        const Icon(
                          Icons.event_available_outlined,
                          size: 18,
                          color: Palette.cyan,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            teamPromise(_allowance).toUpperCase(),
                            style: const TextStyle(
                              color: Color(0xffbff7ff),
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 22),
                    const ScreenTitle('How it ', highlight: 'works', size: 22),
                    const SizedBox(height: 10),
                    for (final (icon, title, text) in const [
                      (
                        Icons.upload_outlined,
                        '1. Send your brief',
                        'Your sport and garment, logos, colours, examples and anything else your designer should know.',
                      ),
                      (
                        Icons.person_outline,
                        '2. Meet your designer',
                        'A 3DEEZI designer takes your request and keeps you posted here and by notification.',
                      ),
                      (
                        Icons.draw_outlined,
                        '3. Review and refine',
                        'See the designs, chat with your designer and ask for revisions until it is right.',
                      ),
                      (
                        Icons.verified_outlined,
                        '4. Approve and order',
                        'Your final design goes to your assets: open it on the 3D kit or order it.',
                      ),
                    ])
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: SurfaceCard(
                          padding: const EdgeInsets.all(14),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Icon(icon, color: Palette.cyan),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      title,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                    const SizedBox(height: 3),
                                    Text(
                                      text,
                                      style: const TextStyle(
                                        color: Palette.muted,
                                        fontSize: 12,
                                        height: 1.4,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    const SizedBox(height: 14),
                    if (!c.signedIn)
                      SurfaceCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Sign in to see the design requests included in your plan and the price of the next one.',
                              style: TextStyle(height: 1.4),
                            ),
                            const SizedBox(height: 10),
                            SecondaryButton(
                              label: 'Sign in',
                              icon: Icons.login,
                              onPressed: () => _signIn(context, c),
                            ),
                          ],
                        ),
                      )
                    else ...[
                      if (_error != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Text(
                            _error!,
                            style: const TextStyle(color: Color(0xffff8b9b)),
                          ),
                        ),
                      if (_allowance != null) TeamAllowanceCard(_allowance!),
                      if (_allowance != null) ...[
                        const SizedBox(height: 12),
                        TeamPolicyCard(allowance: _allowance),
                      ],
                      const SizedBox(height: 18),
                      const SectionLabel('My design requests'),
                      const SizedBox(height: 8),
                      if (_requests == null && _error == null)
                        const Center(
                          child: Padding(
                            padding: EdgeInsets.all(16),
                            child: CircularProgressIndicator(),
                          ),
                        )
                      else if ((_requests ?? const []).isEmpty)
                        const Text(
                          'No design requests yet. Your requests and their progress appear here.',
                          style: TextStyle(color: Palette.muted),
                        )
                      else
                        for (final r in _requests!)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: TeamRequestTile(
                              r,
                              onTap: () => _open((r['id'] as num).toInt()),
                            ),
                          ),
                    ],
                  ],
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
  const _TeamHero({required this.onRequest});
  final VoidCallback onRequest;
  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(16),
    child: Container(
      decoration: BoxDecoration(
        border: Border.all(
          color: Palette.cyan.withValues(alpha: .5),
          width: 1.5,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Stack(
        children: [
          Positioned.fill(
            child: artImage(
              asset: 'assets/images/art/home_team.webp',
              alignment: const Alignment(.4, 0),
            ),
          ),
          const Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  stops: [0, .32, .62, 1],
                  colors: [
                    Color(0x22020912),
                    Color(0x88020912),
                    Color(0xee020912),
                    Color(0xff020912),
                  ],
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(18, 150, 18, 18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '3DEEZI TEAM',
                  style: TextStyle(
                    fontFamily: 'Rajdhani',
                    fontSize: 40,
                    height: 1,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  'REAL DESIGNERS. REAL RESULTS.',
                  style: TextStyle(
                    fontFamily: 'Rajdhani',
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 2,
                    color: Palette.cyan,
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'Let our professional design team bring your ideas to life. Simply upload your logos, colours, examples and design requirements, and we’ll take care of the rest.',
                  style: TextStyle(
                    fontSize: 13,
                    height: 1.5,
                    color: Color(0xffd3dee8),
                  ),
                ),
                const SizedBox(height: 16),
                GradientButton(
                  label: 'REQUEST A DESIGNER',
                  icon: Icons.arrow_forward,
                  onPressed: onRequest,
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class TeamAllowanceCard extends StatelessWidget {
  const TeamAllowanceCard(this.a, {super.key});
  final Map<String, dynamic> a;
  @override
  Widget build(BuildContext context) {
    final next = (a['next_request'] as Map?) ?? const {};
    final paid = next['billing'] == 'paid';
    final unlimited = a['unlimited'] == true;
    Widget fact(String big, String small) => Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        children: [
          SizedBox(
            width: 92,
            child: Text(
              big,
              style: const TextStyle(
                fontFamily: 'Rajdhani',
                fontSize: 22,
                fontWeight: FontWeight.w700,
                color: Palette.cyan,
              ),
            ),
          ),
          Expanded(
            child: Text(
              small,
              style: const TextStyle(color: Palette.muted, fontSize: 12),
            ),
          ),
        ],
      ),
    );
    return SurfaceCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'YOUR PLAN · ${'${a['plan_name'] ?? a['plan']}'.toUpperCase()}',
            style: const TextStyle(
              color: Palette.cyan,
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.6,
            ),
          ),
          fact(
            unlimited ? '∞' : '${a['remaining_included'] ?? 0}',
            unlimited
                ? 'Unlimited requests'
                : 'included requests left this month',
          ),
          fact(
            paid ? _money(next['total'], next['currency']) : 'Included',
            paid ? 'Your next request, incl. GST' : 'Your next request',
          ),
          fact('${a['revisions_per_request'] ?? '-'}', 'Revisions per request'),
          if (paid)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                next['pay_first'] == false
                    ? 'An invoice is issued; your designer starts straight away.'
                    : 'You pay the invoice first; your designer starts when it is paid.',
                style: const TextStyle(color: Color(0xfff7dba6), fontSize: 12),
              ),
            ),
          if (a['can_submit'] == false && a['blocked_reason'] != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                '${a['blocked_reason']}',
                style: const TextStyle(color: Color(0xfff7dba6), fontSize: 12),
              ),
            ),
        ],
      ),
    );
  }
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
                  '${r['garment_name'] ?? r['garment']} · ${r['sport_name'] ?? r['sport']}',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                Text(
                  '${r['name']} · ${_day(r['created_at'])}',
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

/// 3DEEZI TEAM notifications (the same list as the orders bell); tapping one
/// returns its request id.
class TeamNotificationsSheet extends StatefulWidget {
  const TeamNotificationsSheet(this.c, {super.key});
  final AppController c;
  @override
  State<TeamNotificationsSheet> createState() => _TeamNotificationsSheetState();
}

class _TeamNotificationsSheetState extends State<TeamNotificationsSheet> {
  List<Map>? _items;
  @override
  void initState() {
    super.initState();
    widget.c.api
        .notifications()
        .then((n) {
          if (mounted) {
            setState(
              () => _items = ((n['items'] as List?) ?? const [])
                  .cast<Map>()
                  .where((i) => (i['data'] as Map?)?['team_request_id'] != null)
                  .toList(),
            );
          }
        })
        .catchError((Object _) {
          if (mounted) setState(() => _items = const []);
        });
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: SizedBox(
      height: MediaQuery.of(context).size.height * .7,
      child: Column(
        children: [
          ListTile(
            title: const Text(
              '3DEEZI TEAM notifications',
              style: TextStyle(fontWeight: FontWeight.w800),
            ),
            trailing: TextButton(
              onPressed: () async {
                await widget.c.api.readNotifications();
                if (context.mounted) Navigator.pop(context);
              },
              child: const Text('Mark all read'),
            ),
          ),
          Expanded(
            child: _items == null
                ? const Center(child: CircularProgressIndicator())
                : _items!.isEmpty
                ? const Center(
                    child: Text(
                      'No notifications yet.',
                      style: TextStyle(color: Palette.muted),
                    ),
                  )
                : ListView(
                    children: [
                      for (final n in _items!)
                        ListTile(
                          leading: Icon(
                            n['read_at'] == null
                                ? Icons.circle
                                : Icons.circle_outlined,
                            size: 10,
                            color: Palette.cyan,
                          ),
                          title: Text('${(n['data'] as Map)['text'] ?? ''}'),
                          subtitle: Text(
                            '${(n['data'] as Map)['number'] ?? ''} · ${(n['data'] as Map)['name'] ?? ''} · ${_day(n['created_at'])}',
                            style: const TextStyle(
                              color: Palette.muted,
                              fontSize: 12,
                            ),
                          ),
                          onTap: () => Navigator.pop(
                            context,
                            ((n['data'] as Map)['team_request_id'] as num?)
                                ?.toInt(),
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

// ---------------------------------------------------------------- the form

class TeamRequestFormScreen extends StatefulWidget {
  const TeamRequestFormScreen(this.c, {super.key, this.allowance});
  final AppController c;
  final Map<String, dynamic>? allowance;
  @override
  State<TeamRequestFormScreen> createState() => _TeamRequestFormScreenState();
}

class _TeamRequestFormScreenState extends State<TeamRequestFormScreen> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.c.user?.name ?? '');
  late final _email = TextEditingController(text: widget.c.user?.email ?? '');
  final _description = TextEditingController();
  final _instructions = TextEditingController();
  final _garmentOther = TextEditingController();
  final _hex = TextEditingController();
  String? _sport, _garment;
  final _colours = <String>[];
  final _logos = <TeamPick>[];
  final _references = <TeamPick>[];
  List<({String id, String name, String group, List<String> garments})>
  _sports = [];
  List<({String id, String name})> _garments = [];
  bool _busy = false;
  String? _error;
  Map<String, dynamic>? _sent;
  final String _key =
      'app-${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(1 << 30)}';

  @override
  void initState() {
    super.initState();
    _fallbackCatalog();
    _loadCatalog();
  }

  @override
  void dispose() {
    for (final t in [
      _name,
      _email,
      _description,
      _instructions,
      _garmentOther,
      _hex,
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
    _garments = const [
      (id: 'jersey', name: 'Jersey'),
      (id: 'shorts', name: 'Shorts'),
      (id: 'tee', name: 'Training Tee'),
      (id: 'singlet', name: 'Singlet'),
      (id: 'polo', name: 'Polo'),
    ];
  }

  /// The sports from the website's catalogue (new sports appear without an
  /// app update).
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
          _garments = [
            for (final g in garments) (id: '${g['id']}', name: '${g['name']}'),
          ];
        }
      });
    } on Object {
      // Keep the app's copy.
    }
  }

  List<({String id, String name})> get _garmentChoices {
    final wanted =
        _sports.where((s) => s.id == _sport).firstOrNull?.garments ?? const [];
    if (wanted.isEmpty) return _garments;
    return [
      for (final id in wanted) ..._garments.where((g) => g.id == id),
      ..._garments.where((g) => !wanted.contains(g.id)),
    ];
  }

  Future<void> _add(
    String kind,
    List<TeamPick> into,
    int max,
    List<String> types,
  ) async {
    final picked = await pickTeamFiles(kind);
    if (!mounted || picked.isEmpty) return;
    String? problem;
    setState(() {
      for (final f in picked) {
        if (!types.contains(_ext(f.name))) {
          problem = '${f.name}: this file type is not accepted.';
        } else if (f.bytes.length > 20 * 1024 * 1024) {
          problem = '${f.name} is over 20 MB.';
        } else if (into.length >= max) {
          problem = 'Up to $max files here.';
        } else {
          into.add(f);
        }
      }
      _error = problem;
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
    final garment = _garment == '__other'
        ? _garmentOther.text.trim()
        : _garment;
    final size = [
      ..._logos,
      ..._references,
    ].fold<int>(0, (a, f) => a + f.bytes.length);
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
          'garment': garment!,
          if (group != null)
            'category': group == 'apparel' ? 'Apparel' : 'Sports',
          'description': _description.text.trim(),
          if (_instructions.text.trim().isNotEmpty)
            'instructions': _instructions.text.trim(),
        },
        colours: _colours,
        logos: _logos,
        references: _references,
        idempotencyKey: _key,
      );
      if (mounted) setState(() => _sent = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

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

  InputDecoration _dec(String label, {String? hint}) =>
      InputDecoration(labelText: label, hintText: hint);

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Palette.bg,
    body: SafeArea(
      child: Column(
        children: [
          TopBar(
            onBack: () => Navigator.of(
              context,
            ).pop(_sent == null ? null : (_sent!['id'] as num).toInt()),
            title: 'REQUEST A DESIGNER',
          ),
          Expanded(child: _sent != null ? _confirmation(_sent!) : _formView()),
        ],
      ),
    ),
  );

  Widget _confirmation(Map<String, dynamic> r) {
    final invoice = r['invoice'] as Map?;
    final mustPay = r['status'] == 'awaiting_payment' && invoice != null;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const SizedBox(height: 20),
        const Icon(Icons.check_circle_outline, size: 54, color: Palette.cyan),
        const SizedBox(height: 12),
        const Text(
          'SENT TO 3DEEZI TEAM',
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
        Text(
          mustPay
              ? 'This request is ${_incl(invoice['total'] ?? r['price'], r['currency'])}. Pay invoice ${invoice['invoice_number']} and your designer starts straight away.'
              : 'We have your brief. A designer will be assigned shortly; you get a notification at each step.',
          textAlign: TextAlign.center,
          style: const TextStyle(color: Palette.muted, height: 1.5),
        ),
        const SizedBox(height: 22),
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
          onPressed: () => Navigator.of(context).pop((r['id'] as num).toInt()),
        ),
      ],
    );
  }

  Widget _files(
    String label,
    String hint,
    List<TeamPick> files,
    VoidCallback onAdd,
  ) => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        OutlinedButton.icon(
          onPressed: onAdd,
          icon: const Icon(Icons.upload_file),
          label: Text('Add ${label.toLowerCase()}'),
        ),
        Text(hint, style: const TextStyle(color: Palette.muted, fontSize: 11)),
        for (final (i, f) in files.indexed)
          ListTile(
            dense: true,
            contentPadding: EdgeInsets.zero,
            leading: const Icon(
              Icons.insert_drive_file_outlined,
              color: Palette.cyan,
            ),
            title: Text(f.name, overflow: TextOverflow.ellipsis),
            subtitle: Text(
              '${(f.bytes.length / 1024).ceil()} KB',
              style: const TextStyle(fontSize: 11),
            ),
            trailing: IconButton(
              tooltip: 'Remove ${f.name}',
              icon: const Icon(Icons.close, size: 18),
              onPressed: () => setState(() => files.removeAt(i)),
            ),
          ),
      ],
    ),
  );

  Widget _formView() {
    final a = widget.allowance;
    final next = (a?['next_request'] as Map?) ?? const {};
    final blocked = a?['can_submit'] == false;
    String? required(String? v) =>
        (v == null || v.trim().isEmpty) ? 'Required' : null;
    return Form(
      key: _form,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 40),
        children: [
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
            controller: _name,
            decoration: _dec('Customer or business name'),
            inputFormatters: [LengthLimitingTextInputFormatter(120)],
            validator: required,
          ),
          const SizedBox(height: 14),
          TextFormField(
            controller: _email,
            decoration: _dec('Email'),
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
            decoration: _dec('Sport or apparel category'),
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
          DropdownButtonFormField<String>(
            key: const Key('team-garment'),
            initialValue: _garment,
            isExpanded: true,
            decoration: _dec('Garment type'),
            items: [
              for (final g in _garmentChoices)
                DropdownMenuItem(value: g.id, child: Text(g.name)),
              const DropdownMenuItem(
                value: '__other',
                child: Text('Something else…'),
              ),
            ],
            onChanged: (v) => setState(() => _garment = v),
            validator: required,
          ),
          if (_garment == '__other') ...[
            const SizedBox(height: 14),
            TextFormField(
              controller: _garmentOther,
              decoration: _dec('Which garment?', hint: 'e.g. Hoodie'),
              validator: required,
            ),
          ],
          const SizedBox(height: 14),
          TextFormField(
            key: const Key('team-description'),
            controller: _description,
            decoration: _dec(
              'Design description',
              hint: 'Style, pattern, where the logos go, names and numbers…',
            ),
            minLines: 4,
            maxLines: 8,
            maxLength: 4000,
            validator: (v) => (v ?? '').trim().length < 10
                ? 'Describe your design in a few words (10 characters or more).'
                : null,
          ),
          const Text(
            'Preferred colours (up to 8)',
            style: TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
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
          const SizedBox(height: 16),
          _files(
            'Logos',
            'Up to 5: PNG, JPG, SVG, PDF, AI, EPS · 20 MB each',
            _logos,
            () => _add('logos', _logos, 5, teamLogoTypes),
          ),
          _files(
            'References',
            'Up to 10 pictures or documents: PDF, Word, PowerPoint, ZIP',
            _references,
            () => _add('references', _references, 10, teamReferenceTypes),
          ),
          TextFormField(
            controller: _instructions,
            decoration: _dec('Additional instructions (optional)'),
            minLines: 2,
            maxLines: 5,
            maxLength: 4000,
          ),
          if (a != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Text(
                next['billing'] == 'paid'
                    ? 'This request is ${_incl(next['total'], next['currency'])}. After sending, you pay the invoice.'
                    : 'This request is included in your plan.',
                key: const Key('team-price'),
                style: TextStyle(
                  color: next['billing'] == 'paid'
                      ? const Color(0xfff7dba6)
                      : const Color(0xffbff0cf),
                ),
              ),
            ),
          if (blocked)
            Text(
              '${a?['blocked_reason'] ?? ''}',
              style: const TextStyle(color: Color(0xfff7dba6)),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(
                _error!,
                style: const TextStyle(color: Color(0xffff8b9b)),
              ),
            ),
          _busy
              ? const Center(child: CircularProgressIndicator())
              : GradientButton(
                  label: 'SEND TO 3DEEZI TEAM',
                  icon: Icons.send,
                  onPressed: blocked ? null : _send,
                ),
        ],
      ),
    );
  }
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
              Text(
                extra ? 'Extra revision' : 'Request revisions',
                style: const TextStyle(
                  fontFamily: 'Rajdhani',
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                ),
              ),
              if (extra)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    'An extra revision round is ${_incl(((_r?['extra_revision_price'] as Map?) ?? const {})['price'] ?? '25.00', 'AUD')}. You pay its invoice next; your designer starts once it is paid.',
                    style: const TextStyle(color: Color(0xfff7dba6), fontSize: 12),
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
                      : '${files.length} file(s) added',
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
                  : '${r['garment_name'] ?? r['garment']} · ${r['sport_name'] ?? r['sport']}',
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
    final pendingInvoice =
        (r['pending_revision'] as Map?)?['invoice'] as Map?;
    final extraPrice = ((r['extra_revision_price'] as Map?) ?? const {})['price'];
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
              const Icon(Icons.event_available_outlined, size: 16, color: Palette.cyan),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  '${r['status'] == 'revision' ? 'Revision' : ((r['latest_version'] as num?) ?? 0) > 0 ? 'Next design' : 'First design'} due by ${_day(r['due_date'])}',
                  style: const TextStyle(color: Color(0xffbff7ff), fontSize: 13),
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
              label: 'Extra revision ${_money(extraPrice ?? '25.00', r['currency'])}',
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
                ? '${allowed - used} of $allowed revisions left'
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
