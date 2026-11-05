import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show RenderRepaintBoundary;
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/api_client.dart' show ApiUser;
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/screens/library.dart';
import 'package:three_deezi/screens/order_entry.dart'
    show OrderFormScreen, OrderUploadScreen;
import 'package:three_deezi/screens/orders_board.dart' show OrdersBoardScreen;
import 'package:three_deezi/screens/order_assistant.dart';

import 'orders_app_test.dart' show OrdersServer, signedIn;

// Phone-size pictures of the bubble pages (client pictures images/333 and
// 334: Orders, Projects, Profile) with the real fonts, icons and art, for
// checking by eye (HB1 shots). Each page also must lay out without errors.

const _shots =
    r'D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\scratchpad\HB1\shots';

Future<void> _loadFonts() async {
  Future<ByteData> file(String p) async =>
      ByteData.sublistView(File(p).readAsBytesSync());
  await (FontLoader('Rajdhani')
        ..addFont(file('assets/fonts/Rajdhani-Bold.ttf'))
        ..addFont(file('assets/fonts/Rajdhani-SemiBold.ttf')))
      .load();
  await (FontLoader('Inter')..addFont(file('assets/fonts/Inter.ttf'))).load();
  final artifacts = File(Platform.resolvedExecutable).parent.parent.parent;
  final icons = File(
    '${artifacts.path}/material_fonts/materialicons-regular.otf',
  );
  if (icons.existsSync()) {
    await (FontLoader('MaterialIcons')..addFont(file(icons.path))).load();
  }
}

void main() {
  setUpAll(_loadFonts);

  for (final page in const [
    'orders',
    'projects',
    'profile',
    'myorders',
    'orderform',
    'upload',
  ]) {
    for (final size in const [
      Size(360, 740),
      Size(390, 844),
      Size(390, 600),
      Size(430, 932),
    ]) {
      final tag = '${size.width.toInt()}x${size.height.toInt()}';
      testWidgets('$page picture $tag', (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = size;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final key = GlobalKey();
        final c = signedIn(OrdersServer())
          ..screen = switch (page) {
            'orders' => AppScreen.orderHub,
            'projects' => AppScreen.projects,
            'myorders' => AppScreen.orders,
            _ => AppScreen.profile,
          };
        if (page == 'profile') {
          c.user = const ApiUser(
            id: 1,
            name: 'Fabian Soutar',
            email: 'fab@example.test',
          );
        }
        final Widget screen = switch (page) {
          'orders' => OrderAssistantScreen(c, root: true),
          'projects' => ProjectsScreen(c),
          'myorders' => OrdersBoardScreen(c),
          'orderform' => OrderFormScreen(c),
          'upload' => OrderUploadScreen(c),
          _ => ProfileScreen(c),
        };
        await tester.pumpWidget(
          MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: ThemeData(brightness: Brightness.dark, fontFamily: 'Inter'),
            home: RepaintBoundary(
              key: key,
              child: Scaffold(
                backgroundColor: const Color(0xff030a14),
                body: SafeArea(child: screen),
              ),
            ),
          ),
        );
        await tester.pump(const Duration(milliseconds: 100));
        final ctx = tester.element(find.byWidget(screen));
        final images = tester.widgetList<Image>(find.byType(Image)).toList();
        await tester.runAsync(() async {
          for (final img in images) {
            await precacheImage(img.image, ctx);
          }
        });
        await tester.pump(const Duration(milliseconds: 50));
        // (My orders loads its board from the fake server.)
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 200)),
        );
        await tester.pump(const Duration(milliseconds: 50));
        expect(tester.takeException(), isNull);
        final boundary = tester.renderObject<RenderRepaintBoundary>(
          find.byKey(key),
        );
        await tester.runAsync(() async {
          final img = await boundary.toImage(pixelRatio: 1);
          final data = await img.toByteData(format: ui.ImageByteFormat.png);
          Directory(_shots).createSync(recursive: true);
          File(
            '$_shots/$page-$tag.png',
          ).writeAsBytesSync(data!.buffer.asUint8List());
        });
      });
    }
  }
}
