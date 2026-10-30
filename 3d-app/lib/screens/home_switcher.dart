import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../app_controller.dart';
import '../widgets/ui.dart' show showToast;
import 'bubble_home.dart';
import 'create_home.dart';

/// Whether a phone with no saved choice opens the new bubble home.
///
/// OFF until the tester passes the bubble home (2026-10-30): every phone
/// opens the classic home, and the bubble shows only after "Try the new
/// home". Turn it on after testing; slow phones and phones with animations
/// off then still get the classic home.
const bool kBubbleHomeDefault = false;

/// Home (client 2026-10-30): on phones the new glass-bubble home
/// ([BubbleHomeScreen]) or the classic tile home ([CreateHomeScreen]), which
/// the client kept to fall back on. Tablets and wide screens always show the
/// classic home, unchanged.
///
/// The phone remembers the choice under [styleKey]: [bubble] ("Try the new
/// home"), [classic] ("Classic view") or [classicAuto] (the phone was too
/// slow for the bubble; "Try the new home" still overrides it). A saved
/// choice always wins. With nothing saved a phone shows the classic home
/// while [kBubbleHomeDefault] is off. With it on, it shows the bubble
/// (classic when animations are off) and times the bubble's first frames: a
/// slow phone moves to the classic home once, with a note. A device that
/// cannot remember a choice keeps the classic home.
class HomeSwitcher extends StatefulWidget {
  const HomeSwitcher(this.c, {super.key});
  final AppController c;

  static const styleKey = 'home_style';
  static const bubble = 'bubble',
      classic = 'classic',
      classicAuto = 'classic_auto';

  /// A phone: its shortest side is under this.
  static const phoneSide = 600.0;

  /// Frames skipped while the bubble warms up, the frames then timed, and the
  /// average build + raster time over which the phone counts as slow.
  static const warmUpFrames = 5, timedFrames = 60;
  static const slowFrame = Duration(milliseconds: 22);

  static const autoNote =
      'Switched to the classic home for smoother use. '
      'You can try the new home any time.';

  /// The home with nothing saved: the bubble when true ([kBubbleHomeDefault];
  /// tests turn it on and off).
  @visibleForTesting
  static bool bubbleByDefault = kBubbleHomeDefault;

  /// Whether [timings] average more than [slowFrame] of build + raster time.
  static bool tooSlow(Iterable<FrameTiming> timings) {
    var n = 0;
    var total = Duration.zero;
    for (final t in timings) {
      n++;
      total += t.buildDuration + t.rasterDuration;
    }
    return n > 0 && total > slowFrame * n;
  }

  /// Reads the saved choice ahead of the first Home, so it opens on the
  /// right one at once.
  static void preload() => _HomeSwitcherState._read();

  /// Tests: forget the choice read (as after a fresh start).
  @visibleForTesting
  static void debugReset() => _HomeSwitcherState._known = null;

  /// Tests: time the bubble's frames in a debug build too (debug frames are
  /// always slow, so debug builds otherwise keep the bubble).
  @visibleForTesting
  static bool debugTimeFrames = false;

  @override
  State<HomeSwitcher> createState() => _HomeSwitcherState();
}

class _HomeSwitcherState extends State<HomeSwitcher> {
  /// The saved choice as last read or written: null until read, '' when none
  /// is saved, [_unavailable] when this device cannot keep one.
  static String? _known;
  static const _unavailable = '-';

  /// Choices saved; a read that started before one is stale.
  static int _writes = 0;

  static Future<String?> _read() async {
    final writes = _writes;
    String value;
    try {
      final prefs = await SharedPreferences.getInstance();
      value = prefs.getString(HomeSwitcher.styleKey) ?? '';
    } catch (_) {
      value = _unavailable;
    }
    if (writes == _writes) _known = value;
    return _known;
  }

  late String? _saved = _known;

  // The bubble's frame timing (nothing saved, bubble by default).
  bool _timing = false, _timed = false;
  int _warm = 0;
  final _sample = <FrameTiming>[];

  @override
  void initState() {
    super.initState();
    if (_known == null) {
      _read().then((value) {
        if (mounted && value != _saved) setState(() => _saved = value);
      });
    }
  }

  @override
  void dispose() {
    _timeFrames(false);
    super.dispose();
  }

  void _save(String style) {
    _writes++;
    _known = style;
    setState(() => _saved = style);
    SharedPreferences.getInstance()
        .then((p) => p.setString(HomeSwitcher.styleKey, style))
        .catchError((Object _) => false);
  }

  void _timeFrames(bool on) {
    if (on == _timing) return;
    if (on && (_timed || (kDebugMode && !HomeSwitcher.debugTimeFrames))) {
      return;
    }
    _timing = on;
    if (on) {
      SchedulerBinding.instance.addTimingsCallback(_onTimings);
    } else {
      SchedulerBinding.instance.removeTimingsCallback(_onTimings);
    }
  }

  void _onTimings(List<FrameTiming> timings) {
    for (final t in timings) {
      if (_warm < HomeSwitcher.warmUpFrames) {
        _warm++;
      } else {
        _sample.add(t);
      }
    }
    if (_sample.length < HomeSwitcher.timedFrames) return;
    _timeFrames(false);
    _timed = true;
    final slow = HomeSwitcher.tooSlow(_sample.take(HomeSwitcher.timedFrames));
    _sample.clear();
    if (!slow || !mounted || _saved != '') return;
    _save(HomeSwitcher.classicAuto);
    showToast(context, HomeSwitcher.autoNote);
  }

  @override
  Widget build(BuildContext context) {
    final phone =
        MediaQuery.sizeOf(context).shortestSide < HomeSwitcher.phoneSide;
    final bubbleOn =
        phone &&
        switch (_saved) {
          HomeSwitcher.bubble => true,
          // Nothing saved: the default, never with animations off.
          '' =>
            HomeSwitcher.bubbleByDefault &&
                !MediaQuery.disableAnimationsOf(context),
          // Classic, classic_auto, not read yet, or no storage.
          _ => false,
        };
    _timeFrames(bubbleOn && _saved == '');
    if (bubbleOn) {
      return BubbleHomeScreen(
        widget.c,
        onSwitchToClassic: () => _save(HomeSwitcher.classic),
      );
    }
    return CreateHomeScreen(
      widget.c,
      onTryNewHome: phone ? () => _save(HomeSwitcher.bubble) : null,
    );
  }
}
