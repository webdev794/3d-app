import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart' show PointerDeviceKind, kTouchSlop;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';

import '../app_controller.dart';

/// The keyboard goes down the way people expect (user's phone picture 483,
/// 2026-11-06: "How do I move keyboard down" - iPhone keyboards have no hide
/// key), across the whole app:
///
/// * a tap outside a text box closes it (a drag that starts outside leaves
///   it; scrolling a page closes it, see the app's scroll behaviour);
/// * another screen or tab, a page opened or closed, closes it;
/// * a keyboard a web page left open (the Artboard's boxes, after its HOME /
///   AI / DYO buttons) goes down too, with no text box of ours in use.
///
/// [KeyboardOpen] tells the tab bar to make way while the keyboard is up.
/// Sits in the app's `builder`, over every page, sheet and dialog.
class KeyboardDismiss extends StatefulWidget {
  const KeyboardDismiss({
    super.key,
    required this.controller,
    required this.child,
  });
  final AppController controller;
  final Widget child;

  /// Goes in the app's `navigatorObservers`: pages opened and closed.
  static final NavigatorObserver observer = _KeyboardRouteObserver();

  /// Whether one of our text boxes has the focus (the keyboard is ours).
  static bool get typing =>
      FocusManager.instance.primaryFocus?.context
          ?.findAncestorStateOfType<EditableTextState>() !=
      null;

  /// Closes the keyboard now: our text box lets go, and a keyboard a web page
  /// opened goes down once the focus has settled.
  static void close() {
    if (typing) FocusManager.instance.primaryFocus!.unfocus();
    _afterFocusSettles(_hideStray);
  }

  /// [f] after the next frame and the focus changes it asked for (those land
  /// in a microtask after the frame).
  static void _afterFocusSettles(VoidCallback f) {
    WidgetsBinding.instance.addPostFrameCallback((_) => scheduleMicrotask(f));
    WidgetsBinding.instance.scheduleFrame();
  }

  static bool get _mobile =>
      !kIsWeb &&
      (defaultTargetPlatform == TargetPlatform.iOS ||
          defaultTargetPlatform == TargetPlatform.android);

  static bool get _keyboardUp => WidgetsBinding
      .instance
      .platformDispatcher
      .views
      .any((v) => v.viewInsets.bottom > 0);

  /// The phone's own "put the keyboard away" (iOS: whoever opened it).
  static const _keyboard = MethodChannel('3deezi/keyboard');

  /// A keyboard still up with none of our text boxes in use: a web page's
  /// input opened it. Put it away.
  static Future<void> _hideStray() async {
    if (!_mobile || typing || !_keyboardUp) return;
    try {
      await SystemChannels.textInput.invokeMethod<void>('TextInput.hide');
      if (defaultTargetPlatform == TargetPlatform.iOS) {
        await _keyboard.invokeMethod<void>('hide');
      }
    } catch (_) {
      // An older app build without the channel: nothing more to do.
    }
  }

  @override
  State<KeyboardDismiss> createState() => _KeyboardDismissState();
}

class _KeyboardDismissState extends State<KeyboardDismiss> {
  /// The screen shown (set at the start: a lazy value would read the new
  /// screen on the first change).
  late AppScreen _screen;

  /// Where each finger went down outside a focused text box.
  final _downAt = <int, Offset>{};

  /// Where each finger went down anywhere (a web page's keyboard).
  final _pressAt = <int, Offset>{};

  @override
  void initState() {
    super.initState();
    _screen = widget.controller.screen;
    widget.controller.addListener(_onApp);
  }

  @override
  void didUpdateWidget(KeyboardDismiss old) {
    super.didUpdateWidget(old);
    if (old.controller != widget.controller) {
      old.controller.removeListener(_onApp);
      widget.controller.addListener(_onApp);
      _screen = widget.controller.screen;
    }
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onApp);
    super.dispose();
  }

  /// Another screen or tab: the keyboard goes down.
  void _onApp() {
    final now = widget.controller.screen;
    if (now == _screen) return;
    _screen = now;
    KeyboardDismiss.close();
  }

  /// A finger down outside the focused text box. Phones decide on the lift
  /// (a tap, not a drag); a mouse or pen closes it at once (as before).
  Object? _tapOutside(EditableTextTapOutsideIntent intent) {
    final e = intent.pointerDownEvent;
    if (e.kind == PointerDeviceKind.trackpad) return null;
    if (e.kind == PointerDeviceKind.touch && KeyboardDismiss._mobile) {
      if (_downAt.length > 20) _downAt.clear();
      _downAt[e.pointer] = e.position;
    } else {
      intent.focusNode.unfocus();
    }
    return null;
  }

  /// The finger lifts: a tap (it hardly moved) closes the keyboard; the
  /// button under it still gets its tap.
  Object? _tapUpOutside(EditableTextTapUpOutsideIntent intent) {
    final e = intent.pointerUpEvent;
    final down = _downAt.remove(e.pointer);
    if (down != null && (e.position - down).distance <= kTouchSlop) {
      intent.focusNode.unfocus();
    }
    return null;
  }

  /// A tap on the app (not on a web page) while a web page's keyboard is up
  /// and none of our text boxes is in use: the keyboard goes down.
  void _pointerUp(PointerUpEvent e) {
    final down = _pressAt.remove(e.pointer);
    if (down == null || (e.position - down).distance > kTouchSlop) return;
    if (!KeyboardDismiss._mobile ||
        KeyboardDismiss.typing ||
        !KeyboardDismiss._keyboardUp) {
      return;
    }
    if (_overWebPage(e)) return;
    KeyboardDismiss._hideStray();
  }

  /// Whether [e] landed on a native view (a web page): its own taps are the
  /// page's business.
  bool _overWebPage(PointerEvent e) {
    final result = HitTestResult();
    WidgetsBinding.instance.hitTestInView(result, e.position, e.viewId);
    return result.path.any(
      (entry) =>
          entry.target is PlatformViewRenderBox ||
          entry.target is RenderDarwinPlatformView ||
          entry.target is RenderAndroidView,
    );
  }

  @override
  Widget build(BuildContext context) => Listener(
    behavior: HitTestBehavior.translucent,
    onPointerDown: (e) {
      if (_pressAt.length > 20) _pressAt.clear();
      _pressAt[e.pointer] = e.position;
    },
    onPointerUp: _pointerUp,
    onPointerCancel: (e) {
      _pressAt.remove(e.pointer);
      _downAt.remove(e.pointer);
    },
    child: Actions(
      actions: <Type, Action<Intent>>{
        EditableTextTapOutsideIntent:
            CallbackAction<EditableTextTapOutsideIntent>(onInvoke: _tapOutside),
        EditableTextTapUpOutsideIntent:
            CallbackAction<EditableTextTapUpOutsideIntent>(
              onInvoke: _tapUpOutside,
            ),
      },
      child: KeyboardOpen(
        open: MediaQuery.viewInsetsOf(context).bottom > 0,
        child: widget.child,
      ),
    ),
  );
}

/// Pages opened and closed: the keyboard goes down. Closing a page also
/// stops the page underneath from giving its text box the keyboard again.
class _KeyboardRouteObserver extends NavigatorObserver {
  void _settled() => KeyboardDismiss._afterFocusSettles(() {
    if (KeyboardDismiss.typing) {
      FocusManager.instance.primaryFocus!.unfocus();
    }
    KeyboardDismiss._afterFocusSettles(KeyboardDismiss._hideStray);
  });

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      _settled();

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      _settled();

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) =>
      KeyboardDismiss._afterFocusSettles(KeyboardDismiss._hideStray);

  // A page or sheet opened takes the focus itself (its own text box may
  // take the keyboard); only a web page's keyboard is put away.
  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      KeyboardDismiss._afterFocusSettles(KeyboardDismiss._hideStray);
}

/// Whether the keyboard is up (from the app's [KeyboardDismiss]); the tab
/// bar makes way meanwhile. False without one (tests).
class KeyboardOpen extends InheritedWidget {
  const KeyboardOpen({super.key, required this.open, required super.child});
  final bool open;

  static bool of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<KeyboardOpen>()?.open ?? false;

  @override
  bool updateShouldNotify(KeyboardOpen old) => old.open != open;
}
