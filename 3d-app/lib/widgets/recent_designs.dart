import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../app_controller.dart';
import 'flow_ui.dart' show artImage;
import 'ui.dart';

String _ago(DateTime? when) {
  if (when == null) return '';
  final d = DateTime.now().difference(when);
  if (d.inMinutes < 1) return 'just now';
  if (d.inHours < 1) return '${d.inMinutes}m ago';
  if (d.inDays < 1) return '${d.inHours}h ago';
  if (d.inDays < 7) return '${d.inDays}d ago';
  return '${when.day}/${when.month}';
}

Uint8List? _bytes(Object? dataUrl) {
  final s = dataUrl is String ? dataUrl : null;
  final comma = s?.indexOf(',') ?? -1;
  if (s == null || comma < 0) return null;
  try {
    return base64Decode(s.substring(comma + 1));
  } on Object {
    return null;
  }
}

/// Recent designs on the AI Designer start screen (client 2026-10-30, like
/// ChatGPT keeps your chats; the website's RecentDesigns.tsx): the latest
/// briefs with their four designs, newest first, and the latest projects. A
/// brief reopens YOUR DESIGNS with no new AI call; a project opens in the
/// Studio. Signed out: the last brief on this device and "Sign in to keep all
/// your designs".
class RecentDesignsStrip extends StatefulWidget {
  const RecentDesignsStrip(this.c, {super.key});
  final AppController c;
  @override
  State<RecentDesignsStrip> createState() => _RecentDesignsStripState();
}

class _RecentDesignsStripState extends State<RecentDesignsStrip> {
  List<Map<String, dynamic>> _sessions = const [];
  Map<String, dynamic>? _local;
  bool _opening = false;
  AppController get c => widget.c;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final local = await const RecentDesignsStore().load();
    var sessions = const <Map<String, dynamic>>[];
    if (c.signedIn && c.api.configured) {
      try {
        final r = await c.api.aiSessions();
        sessions = [
          for (final s in (r['sessions'] as List? ?? const []))
            s as Map<String, dynamic>,
        ];
      } on Object {
        // Offline: the list stays empty.
      }
    }
    if (mounted) {
      setState(() {
        _local = local;
        _sessions = sessions;
      });
    }
  }

  Future<void> _open(Map<String, dynamic> s) async {
    if (_opening) return;
    setState(() => _opening = true);
    try {
      final full = await c.api.aiSession((s['id'] as num).toInt());
      c.showAiSession(full, id: (s['id'] as num).toInt());
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Those designs could not be opened. Try again.'),
            behavior: SnackBarBehavior.floating,
            backgroundColor: Palette.surface2,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }

  Widget _pics(List<Uint8List?> pics) => ClipRRect(
    borderRadius: BorderRadius.circular(8),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < 4; i++)
          Padding(
            padding: EdgeInsets.only(left: i == 0 ? 0 : 2),
            child: SizedBox(
              width: 21,
              height: 34,
              child: i < pics.length && pics[i] != null
                  ? Image.memory(
                      pics[i]!,
                      fit: BoxFit.cover,
                      gaplessPlayback: true,
                      cacheWidth: 64,
                    )
                  : const ColoredBox(color: Color(0xff0f2230)),
            ),
          ),
      ],
    ),
  );

  Widget _card({
    required Widget pics,
    required String title,
    required String sub,
    required VoidCallback onTap,
    bool project = false,
  }) => Padding(
    padding: const EdgeInsets.only(right: 10),
    child: Material(
      color: const Color(0xd907131c),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: Color(0xff1e3a4a)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 226,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(6, 6, 10, 6),
            child: Row(
              children: [
                pics,
                const SizedBox(width: 9),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          height: 1.2,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        sub,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 10.5,
                          color: project
                              ? const Color(0xff7fe9f3)
                              : const Color(0xff8aa0b2),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final cards = <Widget>[];
    if (c.signedIn) {
      for (final s in _sessions) {
        final count = (s['count'] as num?)?.toInt() ?? 0;
        cards.add(
          _card(
            pics: _pics([
              for (final t in (s['thumbs'] as List? ?? const [])) _bytes(t),
            ]),
            title: '${s['prompt'] ?? ''}',
            sub:
                '$count ${count == 1 ? 'design' : 'designs'} · ${_ago(DateTime.tryParse('${s['updated_at']}')?.toLocal())}',
            onTap: () => _open(s),
          ),
        );
      }
      final projects = [
        for (final p in c.projects)
          if (!p.id.startsWith('sample')) p,
      ]..sort((a, b) => b.updated.compareTo(a.updated));
      for (final p in projects.take(3)) {
        cards.add(
          _card(
            pics: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: SizedBox(
                width: 40,
                height: 34,
                child: p.thumbnail != null || p.asset != null
                    ? artImage(bytes: p.thumbnail, asset: p.asset)
                    : const ColoredBox(
                        color: Color(0xff0f2230),
                        child: Icon(
                          Icons.folder_open_rounded,
                          size: 18,
                          color: Color(0xff7fe9f3),
                        ),
                      ),
              ),
            ),
            title: p.title,
            sub: 'Project · ${p.age}',
            project: true,
            onTap: () => c.loadProject(p),
          ),
        );
      }
    } else if (_local case final s?) {
      cards.add(
        _card(
          pics: _pics([
            for (final o in (s['options'] as List? ?? const []))
              _bytes((o as Map)['image']),
          ]),
          title: '${s['prompt'] ?? ''}',
          sub:
              'Last design on this device · ${_ago(DateTime.tryParse('${s['at']}')?.toLocal())}',
          onTap: () => c.showAiSession(s),
        ),
      );
    }
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (cards.isNotEmpty && c.signedIn)
          const Padding(
            padding: EdgeInsets.only(bottom: 7),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.history_rounded, size: 14, color: Color(0xff7fe9f3)),
                SizedBox(width: 6),
                Text(
                  'RECENT DESIGNS',
                  style: TextStyle(
                    fontFamily: 'Rajdhani',
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 2.5,
                    color: Color(0xff7fe9f3),
                  ),
                ),
              ],
            ),
          ),
        if (cards.isNotEmpty)
          SizedBox(
            height: 58,
            child: Center(
              child: ListView(
                key: const Key('recent-designs'),
                scrollDirection: Axis.horizontal,
                shrinkWrap: true,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                children: cards,
              ),
            ),
          ),
        if (!c.signedIn)
          TextButton.icon(
            onPressed: () => c.go(AppScreen.auth),
            icon: const Icon(Icons.login_rounded, size: 15),
            label: const Text(
              'Sign in to keep all your designs',
              style: TextStyle(fontSize: 12.5),
            ),
            style: TextButton.styleFrom(
              foregroundColor: const Color(0xff9fdfe8),
            ),
          ),
      ],
    );
  }
}
