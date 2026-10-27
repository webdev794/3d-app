import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app.dart';
import 'app_controller.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: Color(0xff05090d),
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );
  final controller = _initialController();
  // Saved projects load in the background, then the signed-in account
  // reopens and syncs; the list updates when ready.
  controller.restoreDevicePrefs();
  controller.restoreProjects().whenComplete(controller.restoreSession);
  runApp(ThreeDeeziApp(controller: controller));
}

/// On the web, `?screen=studio` (any [AppScreen] name) opens that screen
/// directly, for presenting a single step of the flow.
AppController _initialController() {
  final c = AppController();
  if (!kIsWeb) return c;
  final name = Uri.base.queryParameters['screen'];
  final screen = AppScreen.values.where((s) => s.name == name).firstOrNull;
  if (screen == null) return c;
  if (screen == AppScreen.aiDesigner) {
    c.startAi();
  } else if (screen.index >= AppScreen.sport.index &&
      screen.index <= AppScreen.export.index) {
    c.startDyo();
    c.projectName = 'Rugby League Jersey';
  }
  c.screen = screen;
  return c;
}
