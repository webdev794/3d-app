import 'dart:async';

import 'package:flutter/material.dart';

import '../api_client.dart';
import '../app_controller.dart';
import '../screens/order_entry.dart' show openPayPage;
import '../screens/orders_board.dart' show OrderDetailScreen;
import '../screens/team.dart' show TeamRequestScreen;
import 'ui.dart';

// The app's notification bell, as the website's header bell
// (resources/js/components/NotificationBell.tsx): an unread badge, a sheet of
// the newest notifications (GET /api/v1/notifications), opening it marks them
// read (POST /api/v1/notifications/read), and tapping one opens its order,
// 3DEEZI TEAM request or invoice. One feed per AppController is shared by
// every bell (main screens, My orders, 3DEEZI TEAM); the app polls it once a
// minute while it is open and signed in.

/// "just now", "5 min ago", "3 h ago", "2 d ago", else the date (as the website).
String notificationAgo(Object? iso, {DateTime? now}) {
  final at = DateTime.tryParse('${iso ?? ''}');
  if (at == null) return '';
  final s = (now ?? DateTime.now()).difference(at).inSeconds.clamp(0, 1 << 62);
  if (s < 60) return 'just now';
  if (s < 3600) return '${s ~/ 60} min ago';
  if (s < 86400) return '${s ~/ 3600} h ago';
  if (s < 86400 * 30) return '${s ~/ 86400} d ago';
  final d = at.toLocal();
  return '${d.day}/${d.month}/${d.year}';
}

Map _data(Map n) => (n['data'] as Map?) ?? const {};

/// The title the website shows: data.title, else "number · name".
String notificationTitle(Map n) {
  final d = _data(n);
  final title = '${d['title'] ?? ''}'.trim();
  if (title.isNotEmpty) return title;
  final parts = [d['number'], d['name']].where((v) => v != null && '$v'.trim().isNotEmpty).map((v) => '$v');
  return parts.isEmpty ? 'Notification' : parts.join(' · ');
}

bool isTeamNotification(Map n) => _data(n)['team_request_id'] != null || '${_data(n)['link'] ?? ''}'.startsWith('/team/');

/// The signed-in person's notifications, shared by every bell of one [AppController].
class NotificationFeed extends ChangeNotifier {
  NotificationFeed._(this.c) : _user = c.user?.id {
    c.addListener(_account);
  }

  static final _feeds = Expando<NotificationFeed>();

  /// The feed of [c] (made on first use).
  static NotificationFeed of(AppController c) => _feeds[c] ??= NotificationFeed._(c);

  static const pollEvery = Duration(minutes: 1);

  final AppController c;
  int unread = 0;
  List<Map<String, dynamic>> items = const [];
  bool loaded = false;
  // The account the list belongs to: another account starts a new list.
  int? _user;
  Future<void>? _loading;
  int? _loadingFor;
  Timer? _timer;
  AppLifecycleListener? _life;
  bool _hidden = false;

  /// Reads the list again (one call at a time per account); errors keep the last list.
  Future<void> refresh() {
    if (!c.signedIn) {
      _clear();
      return Future.value();
    }
    final user = c.user?.id;
    final running = _loading;
    if (running != null && _loadingFor == user) return running;
    late final Future<void> run;
    run = _fetch(user).whenComplete(() {
      if (identical(_loading, run)) _loading = null;
    });
    _loading = run;
    _loadingFor = user;
    return run;
  }

  Future<void> _fetch(int? user) async {
    try {
      final n = await c.api.notifications();
      // Signed out, or signed in as someone else, meanwhile: not their list.
      if (!c.signedIn || c.user?.id != user) return;
      items = ((n['items'] as List?) ?? const []).whereType<Map>().map((m) => m.cast<String, dynamic>()).toList();
      unread = (n['unread'] as num?)?.toInt() ?? items.where((i) => i['read_at'] == null).length;
      loaded = true;
      notifyListeners();
    } on Object {
      // Keep the last list; the next poll tries again.
    }
  }

  /// Loads once when nothing is loaded yet (a bell on a screen opened on its own).
  void ensureLoaded() {
    if (!loaded && c.signedIn) unawaited(refresh());
  }

  /// Polls once a minute while the app is open (not in the background) and signed in.
  void startPolling() {
    _timer?.cancel();
    _timer = Timer.periodic(pollEvery, (_) {
      if (!_hidden && c.signedIn) unawaited(refresh());
    });
    _life ??= AppLifecycleListener(
      onStateChange: (s) {
        final was = _hidden;
        _hidden = s == AppLifecycleState.paused || s == AppLifecycleState.hidden || s == AppLifecycleState.detached;
        if (was && !_hidden && c.signedIn) unawaited(refresh());
      },
    );
    if (c.signedIn) unawaited(refresh());
  }

  void stopPolling() {
    _timer?.cancel();
    _timer = null;
    _life?.dispose();
    _life = null;
  }

  int unreadWhere(bool Function(Map n)? only) =>
      only == null ? unread : items.where((n) => n['read_at'] == null && only(n)).length;

  /// Marks [ids] read (all without ids) here at once, then on the server.
  Future<void> markRead([List<String>? ids]) async {
    final now = DateTime.now().toUtc().toIso8601String();
    final marked = ids == null ? 0 : items.where((n) => ids.contains(n['id']) && n['read_at'] == null).length;
    items = [
      for (final n in items)
        if ((ids == null || ids.contains(n['id'])) && n['read_at'] == null) {...n, 'read_at': now} else n,
    ];
    unread = ids == null ? 0 : (unread - marked).clamp(0, 1 << 30);
    notifyListeners();
    try {
      final left = await c.api.readNotifications(ids: ids);
      if (left != null && left != unread) {
        unread = left;
        notifyListeners();
      }
    } on Object {
      // Shown read here; the next poll brings the server's count back.
    }
  }

  /// Sign-out empties the bell; signing in (as anyone) reads that account's list.
  void _account() {
    final user = c.signedIn ? c.user?.id : null;
    if (user == _user) return;
    _user = user;
    _clear();
    if (user != null) unawaited(refresh());
  }

  void _clear() {
    if (!loaded && unread == 0 && items.isEmpty) return;
    items = const [];
    unread = 0;
    loaded = false;
    notifyListeners();
  }

  @override
  void dispose() {
    stopPolling();
    c.removeListener(_account);
    _feeds[c] = null;
    super.dispose();
  }
}

/// Opens the screen a notification is about: its 3DEEZI TEAM request, its
/// order (the order shows its invoice and PAY NOW), or an invoice's pay page.
Future<void> openNotification(BuildContext context, AppController c, Map n) async {
  final d = _data(n);
  final link = '${d['link'] ?? ''}';
  int? idIn(String prefix) => link.startsWith(prefix) ? int.tryParse(link.substring(prefix.length).split(RegExp('[/?#]')).first) : null;
  final nav = Navigator.of(context);
  final team = (d['team_request_id'] as num?)?.toInt() ?? idIn('/team/requests/');
  if (team != null) {
    await nav.push(MaterialPageRoute<void>(builder: (_) => TeamRequestScreen(c, team)));
    return;
  }
  final order = (d['order_id'] as num?)?.toInt() ?? idIn('/orders/');
  if (order != null) {
    await nav.push(MaterialPageRoute<void>(builder: (_) => OrderDetailScreen(c, order)));
    return;
  }
  if (link.startsWith('/invoices/')) {
    final number = Uri.decodeComponent(link.substring('/invoices/'.length).split(RegExp('[/?#]')).first);
    final messenger = ScaffoldMessenger.maybeOf(context);
    try {
      final url = await c.api.invoicePayLink(number);
      if (context.mounted) await openPayPage(context, url, 'Invoice $number');
    } on ApiException catch (e) {
      messenger?.showSnackBar(SnackBar(content: Text(e.message)));
    }
  }
}

/// The bell: an unread badge; tapping opens [NotificationsSheet]. [only] keeps
/// some notifications (the 3DEEZI TEAM bell shows TEAM ones); [onClosed] runs
/// after the sheet and any screen opened from it close.
class NotificationBell extends StatefulWidget {
  const NotificationBell(this.c, {super.key, this.only, this.title = 'Notifications', this.onClosed});
  final AppController c;
  final bool Function(Map n)? only;
  final String title;
  final VoidCallback? onClosed;

  @override
  State<NotificationBell> createState() => _NotificationBellState();
}

class _NotificationBellState extends State<NotificationBell> {
  late NotificationFeed _feed = NotificationFeed.of(widget.c);

  @override
  void initState() {
    super.initState();
    _feed.ensureLoaded();
  }

  @override
  void didUpdateWidget(NotificationBell old) {
    super.didUpdateWidget(old);
    if (old.c != widget.c) {
      _feed = NotificationFeed.of(widget.c);
      _feed.ensureLoaded();
    }
  }

  Future<void> _open() async {
    final tapped = await showModalBottomSheet<Map>(
      context: context,
      backgroundColor: Palette.surface,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => NotificationsSheet(widget.c, only: widget.only, title: widget.title),
    );
    if (!mounted) return;
    if (tapped != null) await openNotification(context, widget.c, tapped);
    if (!mounted) return;
    // The screen's own reload reads the list again (one call, not two); else read it here.
    final onClosed = widget.onClosed;
    if (onClosed != null) {
      onClosed();
    } else {
      unawaited(_feed.refresh());
    }
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: Listenable.merge([_feed, widget.c]),
    builder: (context, _) {
      if (!widget.c.signedIn) return const SizedBox.shrink();
      final n = _feed.unreadWhere(widget.only);
      return IconButton(
        key: const Key('notification-bell'),
        tooltip: n > 0 ? '${widget.title}, $n unread' : widget.title,
        onPressed: _open,
        icon: Badge(
          isLabelVisible: n > 0,
          label: Text(n > 99 ? '99+' : '$n'),
          child: const Icon(Icons.notifications_outlined),
        ),
      );
    },
  );
}

/// The newest notifications first (title, text, time ago). Opening it marks
/// the unread ones read; the unread dots stay for this look. Tapping one
/// closes the sheet with that notification.
class NotificationsSheet extends StatefulWidget {
  const NotificationsSheet(this.c, {super.key, this.only, this.title = 'Notifications'});
  final AppController c;
  final bool Function(Map n)? only;
  final String title;

  @override
  State<NotificationsSheet> createState() => _NotificationsSheetState();
}

class _NotificationsSheetState extends State<NotificationsSheet> {
  late final NotificationFeed _feed = NotificationFeed.of(widget.c);
  List<Map<String, dynamic>>? _items;

  List<Map<String, dynamic>> _shown() {
    final only = widget.only;
    return only == null ? _feed.items : _feed.items.where(only).toList();
  }

  @override
  void initState() {
    super.initState();
    if (_feed.loaded) _items = _shown();
    _feed.refresh().whenComplete(() {
      if (!mounted) return;
      final shown = _shown();
      setState(() => _items = shown);
      final unread = [for (final n in shown) if (n['read_at'] == null) '${n['id']}'];
      if (unread.isEmpty) return;
      // The website marks all of them read when its bell opens; a filtered bell marks only its own.
      unawaited(_feed.markRead(widget.only == null ? null : unread));
    });
  }

  @override
  Widget build(BuildContext context) {
    final items = _items;
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.of(context).size.height * .7,
        child: Column(
          children: [
            ListTile(
              title: Text(widget.title, style: const TextStyle(fontWeight: FontWeight.w800)),
              // A way out on an iPhone (no Back button); a tap above the sheet closes it too.
              trailing: IconButton(
                key: const ValueKey('sheet-close'),
                tooltip: 'Close',
                onPressed: () => Navigator.of(context).maybePop(),
                icon: const Icon(Icons.close, color: Palette.text),
              ),
            ),
            Expanded(
              child: items == null
                  ? const Center(child: CircularProgressIndicator())
                  : items.isEmpty
                  ? const Center(child: Text('You have no notifications yet.', style: TextStyle(color: Palette.muted)))
                  : ListView(
                      children: [
                        for (final n in items)
                          ListTile(
                            key: ValueKey('notification-${n['id']}'),
                            leading: Icon(n['read_at'] == null ? Icons.circle : Icons.circle_outlined, size: 10, color: Palette.cyan),
                            title: Text(notificationTitle(n), style: TextStyle(fontWeight: n['read_at'] == null ? FontWeight.w700 : FontWeight.w500)),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if ('${_data(n)['text'] ?? ''}'.isNotEmpty) Text('${_data(n)['text']}'),
                                Text(notificationAgo(n['created_at']), style: const TextStyle(color: Palette.muted, fontSize: 11)),
                              ],
                            ),
                            onTap: () => Navigator.pop(context, n),
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
