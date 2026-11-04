// TEMPORARY (PW1): Home and the four bubble pages in one harness, top and
// scrolled to the bottom, with their layout numbers. Deleted after the work.
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show RenderRepaintBoundary;
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/api_client.dart' show ApiUser;
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/screens/bubble_home.dart';
import 'package:three_deezi/screens/library.dart';
import 'package:three_deezi/screens/orders_board.dart' show OrdersBoardScreen;
import 'package:three_deezi/screens/orders_tab.dart';
import 'package:three_deezi/widgets/ui.dart' show BottomNav;

import 'features_test.dart' show FakeStore;
import 'orders_app_test.dart' show OrdersServer, signedIn;

const _out =
    r'D:\systemp\claude\d--3d-app\f8ed271f-373f-48f2-8ab8-74454c4c0e9f\scratchpad\PW1\shots';

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

Map<String, dynamic> _rect(Rect r) => {
  'l': r.left,
  't': r.top,
  'r': r.right,
  'b': r.bottom,
  'w': r.width,
  'h': r.height,
};

void main() {
  setUpAll(_loadFonts);
  final sizes = (Platform.environment['PW1_SIZES'] ?? '360x740,390x844,430x932')
      .split(',')
      .map((s) {
        final p = s.split('x');
        return Size(double.parse(p[0]), double.parse(p[1]));
      })
      .toList();
  final pages = (Platform.environment['PW1_PAGES'] ??
          'home,projects,profile,orders,myorders')
      .split(',');
  final many = Platform.environment['PW1_MANY'] == '1';

  for (final page in pages) {
    for (final size in sizes) {
      final tag = '${size.width.toInt()}x${size.height.toInt()}';
      testWidgets('$page $tag', (tester) async {
        tester.view.devicePixelRatio = 1;
        tester.view.physicalSize = size;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final key = GlobalKey();
        final AppController c;
        if (page == 'home') {
          c = AppController(store: FakeStore())..screen = AppScreen.home;
        } else {
          final server = OrdersServer();
          c = signedIn(server)
            ..screen = switch (page) {
              'orders' => AppScreen.orderHub,
              'projects' => AppScreen.projects,
              'myorders' => AppScreen.orders,
              _ => AppScreen.profile,
            };
        }
        if (page == 'profile') {
          c.user = const ApiUser(
            id: 1,
            name: 'Fabian Soutar',
            email: 'fab@example.test',
          );
        }
        final Widget screen = switch (page) {
          'home' => BubbleHomeScreen(c, onSwitchToClassic: () {}),
          'orders' => OrdersTabScreen(c),
          'projects' => ProjectsScreen(c),
          'myorders' => OrdersBoardScreen(c),
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
        await tester.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 200)),
        );
        await tester.pump(const Duration(milliseconds: 50));
        expect(tester.takeException(), isNull);
        Future<void> shot(String name) async {
          final boundary = tester.renderObject<RenderRepaintBoundary>(
            find.byKey(key),
          );
          await tester.runAsync(() async {
            final img = await boundary.toImage(pixelRatio: 1);
            final data = await img.toByteData(format: ui.ImageByteFormat.png);
            Directory(_out).createSync(recursive: true);
            File(
              '$_out/$name.png',
            ).writeAsBytesSync(data!.buffer.asUint8List());
          });
        }

        final bubbleKey = switch (page) {
          'home' => const ValueKey('bubble-glass'),
          'orders' => const ValueKey('orders-bubble'),
          'projects' => const ValueKey('projects-bubble'),
          'myorders' => const ValueKey('my-orders-bubble'),
          _ => const ValueKey('profile-bubble'),
        };
        final heading = switch (page) {
          'home' => "LET'S CREATE",
          'orders' => 'ORDERS',
          'projects' => 'PROJECTS',
          'myorders' => 'MY ORDERS',
          _ => 'PROFILE',
        };
        final info = <String, dynamic>{
          'page': page,
          'size': tag,
          'bubble': _rect(tester.getRect(find.byKey(bubbleKey))),
          'heading': _rect(tester.getRect(find.text(heading).first)),
          'nav': _rect(tester.getRect(find.byType(BottomNav))),
        };
        await shot('$page-$tag-top');
        // Scrolled to the bottom (Home does not scroll on phones).
        final scrollables = find.byType(Scrollable);
        if (page != 'home' && scrollables.evaluate().isNotEmpty) {
          final st = tester.state<ScrollableState>(scrollables.first);
          info['scrollMax'] = st.position.maxScrollExtent;
          st.position.jumpTo(st.position.maxScrollExtent);
          await tester.pump(const Duration(milliseconds: 50));
          info['bubbleBottomShot'] = _rect(
            tester.getRect(find.byKey(bubbleKey)),
          );
          await shot('$page-$tag-bottom');
        }
        File(
          '$_out/$page-$tag.json',
        ).writeAsStringSync(const JsonEncoder.withIndent(' ').convert(info));
        if (many) {}
      });
    }
  }
}
