import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/api_client.dart';
import 'package:three_deezi/app.dart';
import 'package:three_deezi/app_controller.dart';

import 'features_test.dart' show FakeStore;
import 'flow_test.dart' show tapText;

// Client 2026-11-10 (images/494): "Take all examples out". The Projects tab
// shows only the customer's own projects, with clean empty states.

const _sizes = [Size(360, 780), Size(390, 844), Size(430, 932)];

Future<void> _mount(WidgetTester tester, AppController c, Size size) async {
  tester.view.devicePixelRatio = 1;
  tester.view.physicalSize = size;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(ThreeDeeziApp(controller: c));
  await tester.pump(const Duration(milliseconds: 400));
}

Project _kit(AppController c, String title, String mode, {bool ok = false}) =>
    Project(
      title: title,
      sport: 'Soccer',
      garment: 'Jersey',
      mode: mode,
      updated: DateTime.now(),
      kit: c.kit,
      approved: ok,
    );

const _examples = [
  'Warriors Concept',
  'Mantis Elite',
  'Club Jersey',
  'Morahu',
  'Coastal Blues',
  'Away Edition',
];

void main() {
  test('a new app has no example projects', () {
    final c = AppController(store: FakeStore());
    addTearDown(c.dispose);
    expect(c.projects, isEmpty);
  });

  for (final size in _sizes) {
    testWidgets('signed out, no projects: the sign-in prompt (${size.width})', (
      tester,
    ) async {
      final c = AppController(store: FakeStore())..screen = AppScreen.projects;
      addTearDown(c.dispose);
      await _mount(tester, c, size);
      for (final t in _examples) {
        expect(find.text(t), findsNothing);
      }
      expect(find.byKey(const ValueKey('projects-signin')), findsOneWidget);
      expect(find.text('Make it yours.'), findsOneWidget);
      // No search or filters over nothing.
      expect(find.byKey(const ValueKey('projects-search')), findsNothing);
      expect(find.text('Approved'), findsNothing);
      expect(tester.takeException(), isNull);
      await tapText(tester, 'SIGN IN OR CREATE AN ACCOUNT');
      expect(c.screen, AppScreen.auth);
    });

    testWidgets('signed in, no projects: No projects yet (${size.width})', (
      tester,
    ) async {
      final c = AppController(store: FakeStore())
        ..user = const ApiUser(id: 1, name: 'Ana', email: 'ana@example.test')
        ..screen = AppScreen.projects;
      addTearDown(c.dispose);
      await _mount(tester, c, size);
      expect(find.text('No projects yet'), findsOneWidget);
      expect(
        find.text('Create a new kit and save it in the studio to add it here.'),
        findsOneWidget,
      );
      expect(find.byKey(const ValueKey('projects-start-ai')), findsOneWidget);
      expect(find.byKey(const ValueKey('projects-start-dyo')), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.ensureVisible(
        find.byKey(const ValueKey('projects-start-dyo')),
      );
      await tester.tap(find.byKey(const ValueKey('projects-start-dyo')));
      await tester.pump(const Duration(milliseconds: 400));
      expect(c.mode, 'DYO');
      expect(c.screen, AppScreen.sport);
    });
  }

  testWidgets('real projects: filters, search, clear and open', (tester) async {
    final c = AppController(store: FakeStore())
      ..user = const ApiUser(id: 1, name: 'Ana', email: 'ana@example.test')
      ..screen = AppScreen.projects;
    addTearDown(c.dispose);
    c.projects.addAll([
      _kit(c, 'Thunder Home', 'DYO', ok: true),
      _kit(c, 'Storm Away', 'AI'),
    ]);
    await _mount(tester, c, const Size(390, 844));
    expect(find.text('Thunder Home'), findsOneWidget);
    expect(find.text('Storm Away'), findsOneWidget);
    for (final t in _examples) {
      expect(find.text(t), findsNothing);
    }
    await tapText(tester, 'AI');
    expect(find.text('Storm Away'), findsOneWidget);
    expect(find.text('Thunder Home'), findsNothing);
    await tapText(tester, 'DYO');
    expect(find.text('Thunder Home'), findsOneWidget);
    expect(find.text('Storm Away'), findsNothing);
    await tapText(tester, 'Approved');
    expect(find.text('Thunder Home'), findsOneWidget);
    expect(find.text('Storm Away'), findsNothing);
    await tapText(tester, 'All');
    await tester.enterText(
      find.byKey(const ValueKey('projects-search')),
      'zzz',
    );
    await tester.pump();
    expect(find.text('No matching projects'), findsOneWidget);
    await tapText(tester, 'CLEAR FILTERS');
    expect(find.text('Thunder Home'), findsOneWidget);
    expect(find.text('Storm Away'), findsOneWidget);
    await tapText(tester, 'Storm Away');
    expect(
      c.selectedProject,
      c.projects.indexWhere((p) => p.title == 'Storm Away'),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'signed out with kits on this device: the kits and a sign-in link',
    (tester) async {
      final c = AppController(store: FakeStore())..screen = AppScreen.projects;
      addTearDown(c.dispose);
      c.projects.add(_kit(c, 'Guest Kit', 'DYO'));
      await _mount(tester, c, const Size(360, 780));
      expect(find.text('Guest Kit'), findsOneWidget);
      expect(find.byKey(const ValueKey('projects-signin')), findsNothing);
      expect(
        find.byKey(const ValueKey('projects-signin-link')),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    },
  );

  for (final size in const [Size(360, 780), Size(390, 844)]) {
    testWidgets('Assets: no example pictures; empty tabs (${size.width})', (
      tester,
    ) async {
      final c = AppController(store: FakeStore())..screen = AppScreen.assets;
      addTearDown(c.dispose);
      await _mount(tester, c, size);
      Finder bundled(String name) => find.byWidgetPredicate(
        (w) =>
            w is Image &&
            w.image is AssetImage &&
            (w.image as AssetImage).assetName.contains(name),
      );
      // Logos: only 3DEEZI's own mark, no example logo.
      expect(bundled('splash_mark'), findsOneWidget);
      expect(bundled('reference_'), findsNothing);
      await tapText(tester, 'Uploads');
      expect(bundled('reference_'), findsNothing);
      expect(find.text('No uploads yet'), findsOneWidget);
      expect(find.text('UPLOAD ASSET'), findsOneWidget);
      await tapText(tester, 'Artwork');
      expect(bundled('project_'), findsNothing);
      expect(find.text('No artwork yet'), findsOneWidget);
      expect(find.byKey(const ValueKey('projects-start-ai')), findsOneWidget);
      expect(tester.takeException(), isNull);
      // A picture of the customer's own fills the tab.
      c.update(() => c.uploads.add(Uint8List.fromList(_png)));
      await tapText(tester, 'Uploads');
      expect(find.text('No uploads yet'), findsNothing);
    });
  }
}

// A 1x1 PNG.
const _png = [
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, //
  0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84,
  120, 156, 99, 248, 15, 4, 0, 9, 251, 3, 253, 227, 85, 242, 156, 0, 0, 0,
  0, 73, 69, 78, 68, 174, 66, 96, 130,
];
