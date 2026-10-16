import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import 'api_client.dart';
import 'app_controller.dart';

/// Runs one 3DEEZI ASSIST command on a screen; returns what it did, or throws
/// an [AssistError] saying why it could not.
typedef AssistRunner = Future<String> Function(String action, String value);

class AssistError implements Exception {
  AssistError(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Screens that can run commands register here while they are open: the
/// Artboard (once its page is ready) and the Studio.
class AssistBridge {
  static final _runners = <String, AssistRunner>{};

  static void register(String target, AssistRunner runner) =>
      _runners[target] = runner;

  static void unregister(String target, AssistRunner runner) {
    if (identical(_runners[target], runner)) _runners.remove(target);
  }

  static AssistRunner? of(String target) => _runners[target];
}

/// What a command did, shown under the answer (✓ or ⚠).
@immutable
class AssistDone {
  const AssistDone(this.ok, this.text, {this.info = false});
  final bool ok;
  final String text;

  /// Left as it was because it already was ("already has a drop shadow").
  final bool info;
}

class AssistMessage {
  AssistMessage.user(this.text) : fromUser = true, error = false;
  AssistMessage.assistant(this.text, {this.error = false}) : fromUser = false;
  final bool fromUser, error;
  String text;
  List<AssistDone>? done;
}

/// 3DEEZI ASSIST in the app: the same help chat as on the website, answered
/// by the website's server (`POST /assist`), with the same commands.
class AssistController extends ChangeNotifier {
  AssistController(this.app);
  final AppController app;

  static const greeting =
      "Hi! I'm 3DEEZI ASSIST.\nWhat would you like help with?";

  bool open = false, busy = false;
  final messages = <AssistMessage>[];

  static const _artboardActions = {
    'grid', 'snap', 'rulers', 'snapTo', 'tool', 'select', 'arrange', 'align', //
    'mirror',
    'group',
    'duplicate',
    'connect',
    'varline',
    'page',
    'gradient',
    'palette',
    'move',
    'rotate',
    'scale',
    'size',
    'fill', //
    'outline',
    'menu',
    'effect',
    'add',
    'zoom',
    'pageSize',
    'units',
    'tab',
    'help',
  };
  static const _studioActions = {
    'view', 'panel', 'garment', 'board', 'export', 'design', 'studioAi', //
  };

  /// Screens where the chat is not offered (start-up and AI generation).
  static const hiddenOn = {
    AppScreen.splash,
    AppScreen.onboarding,
    AppScreen.generating,
  };

  void toggle() {
    open = !open;
    notifyListeners();
  }

  void minimise() {
    open = false;
    notifyListeners();
  }

  /// Ends the chat and clears it.
  void endChat() {
    messages.clear();
    open = false;
    notifyListeners();
  }

  /// Quick questions for the screen the visitor is on.
  List<String> get suggestions => switch (app.screen) {
    AppScreen.artboard => const [
      'Which tool makes a curved team name?',
      'Explain the Contour tool',
      'How do I send my design to 3D?',
    ],
    AppScreen.studio || AppScreen.export || AppScreen.saveProject => const [
      'How do I add my logo?',
      'How do I add names and numbers?',
      'How do I download my design?',
    ],
    AppScreen.pricing => const [
      'Which plan suits my team?',
      'What does an AI credit buy?',
      'Is there a free plan?',
    ],
    AppScreen.aiDesigner ||
    AppScreen.concepts ||
    AppScreen.sport ||
    AppScreen.garment => const [
      'AI or Design Your Own: which should I use?',
      'Can I turn a picture of a kit into 3D?',
      'Can I design shorts or a full kit?',
    ],
    _ => const [
      'How do I start designing?',
      'Show me the Artboard',
      'Which plan suits my team?',
    ],
  };

  /// The website page that matches the app screen (the server's knowledge is
  /// organised by page).
  static String pathOf(AppScreen screen) => switch (screen) {
    AppScreen.aiDesigner ||
    AppScreen.generating ||
    AppScreen.concepts => '/create/ai',
    AppScreen.sport || AppScreen.garment => '/create/sport',
    AppScreen.studio ||
    AppScreen.saveProject ||
    AppScreen.export ||
    AppScreen.showcase => '/studio',
    AppScreen.projects => '/projects',
    AppScreen.assets => '/assets',
    AppScreen.profile => '/dashboard',
    AppScreen.artboard => '/artboard',
    AppScreen.pricing => '/pricing',
    AppScreen.orders => '/orders',
    _ => '/',
  };

  static const _pageNames = {
    '/': 'Home',
    '/create/ai': 'AI Powered Sportswear',
    '/create/sport': 'Design Your Own', //
    '/convert': 'Home',
    '/projects': 'Projects',
    '/approved': 'Projects',
    '/assets': 'Assets',
    '/dashboard': 'Projects',
    '/downloads': 'Projects',
    '/orders': 'My orders',
    '/pricing': 'Plans',
    '/studio': 'the 3D Studio', '/artboard': 'the Artboard',
  };

  /// Opens the app screen for a website path (from a link or an `open` command).
  void openPath(String path) {
    final page = path.split('#').first.isEmpty ? '/' : path.split('#').first;
    switch (page) {
      case '/create/ai':
        app.startAi();
      case '/create/sport':
        app.startDyo();
      case '/projects' || '/approved' || '/dashboard' || '/downloads':
        app.go(AppScreen.projects);
      case '/assets':
        app.go(AppScreen.assets);
      case '/orders':
        app.go(AppScreen.orders);
      case '/pricing':
        app.go(AppScreen.pricing);
      case '/studio':
        app.go(AppScreen.studio);
      case '/artboard':
        app.go(AppScreen.artboard);
      default:
        app.go(AppScreen.home);
    }
  }

  static bool isPage(String path) => _pageNames.containsKey(
    path.split('#').first.isEmpty ? '/' : path.split('#').first,
  );

  Future<void> ask(String question) async {
    final q = question.trim();
    if (q.isEmpty || busy) return;
    final history = [
      for (final m in messages.where((m) => !m.error))
        {'role': m.fromUser ? 'user' : 'assistant', 'content': m.text},
      {'role': 'user', 'content': q},
    ];
    messages.add(AssistMessage.user(q));
    busy = true;
    open = true;
    notifyListeners();
    try {
      // On the Artboard: what is on the page and selected, so the answer fits
      // it ("the logo already has a drop shadow").
      String? context;
      final board = app.screen == AppScreen.artboard
          ? AssistBridge.of('artboard')
          : null;
      if (board != null) {
        context = await board('describe', '')
            .timeout(const Duration(seconds: 3))
            .then<String?>((v) => v, onError: (_) => null);
      }
      final r = await app.api.assist(
        history.sublist(math.max(0, history.length - 12)),
        page: pathOf(app.screen),
        can: const ['commands'],
        context: context,
      );
      final answer = AssistMessage.assistant(r.reply);
      messages.add(answer);
      notifyListeners();
      if (r.actions.isNotEmpty) {
        final done = await run(r.actions);
        answer.done = done;
        // The answer was written before the commands ran ("Done: …"): when
        // nothing worked say so instead, and when only part worked say that first.
        // "Already there" (info) is not a failure: the object was left as it was.
        if (done.every((d) => !d.ok && !d.info)) {
          answer.text = "I couldn't do that:";
        } else if (done.any((d) => !d.ok && !d.info)) {
          answer.text =
              "**Part of this didn't work (see below).**\n${answer.text}";
        } else if (done.any((d) => d.info)) {
          answer.text = "That's already there, so I left it as it is:";
        }
        // The chat covers most of a phone screen: get out of the way to show what changed.
        if (done.any((d) => d.ok)) open = false;
      }
    } on Object catch (e) {
      // Never show a raw server error: only the messages written for people
      // (wait, no connection, sign in …).
      final status = e is ApiException ? e.status : null;
      messages.add(
        AssistMessage.assistant(
          status == 429
              ? "You're asking quickly. Please wait a moment and try again."
              : e is ApiException && (status == null || status < 500)
              ? e.message
              : '3DEEZI ASSIST had a problem answering. Please try again in a moment.',
          error: true,
        ),
      );
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  /// Runs the commands in order, opening the Artboard or the Studio first.
  Future<List<AssistDone>> run(List<(String, String)> actions) async {
    final done = <AssistDone>[];
    var unselected = false;
    for (final (action, value) in actions) {
      // The rest were planned for objects that could not be selected: don't
      // apply them to whatever is selected now.
      if (unselected) {
        done.add(
          const AssistDone(
            false,
            'Skipped: those objects could not be selected.',
          ),
        );
        continue;
      }
      try {
        if (action == 'open') {
          if (!isPage(value)) throw AssistError('That page is not in the app.');
          openPath(value);
          done.add(
            AssistDone(
              true,
              'Opened ${_pageNames[value.split('#').first.isEmpty ? '/' : value.split('#').first]}',
            ),
          );
          continue;
        }
        final target = _artboardActions.contains(action)
            ? 'artboard'
            : _studioActions.contains(action)
            ? 'studio'
            : null;
        if (target == null) throw AssistError("I can't do that here.");
        final screen = target == 'artboard'
            ? AppScreen.artboard
            : AppScreen.studio;
        if (app.screen != screen) app.go(screen);
        final runner = await _waitFor(target);
        done.add(AssistDone(true, await runner(action, value)));
      } on Object catch (e) {
        // "ALREADY: …": the object already had it and was left as it was.
        final text = '$e', already = text.startsWith('ALREADY: ');
        done.add(
          AssistDone(false, already ? text.substring(9) : text, info: already),
        );
        unselected = action == 'select';
      }
    }
    return done;
  }

  /// Waits (up to 20 s) for a screen to be ready for commands.
  static Future<AssistRunner> _waitFor(String target) async {
    for (var i = 0; i < 200; i++) {
      final runner = AssistBridge.of(target);
      if (runner != null) return runner;
      await Future<void>.delayed(const Duration(milliseconds: 100));
    }
    throw AssistError(
      'The ${target == 'artboard' ? 'Artboard' : 'Studio'} did not open in time. Please try again.',
    );
  }
}
