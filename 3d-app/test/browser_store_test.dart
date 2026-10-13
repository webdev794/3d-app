import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/project_store.dart';
import 'package:three_deezi/project_store_web.dart' as browser;

class UnavailableStore extends ProjectStore {
  @override
  Future<void> save(Project project) async => throw StateError('quota');
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test(
    'browser projects and artwork survive reload, replacement and deletion',
    () async {
      final c = AppController();
      addTearDown(c.dispose);
      c.addLayer({'type': 'text', 'text': 'CLUB'});
      final p = Project(
        id: 'local-1',
        title: 'Home',
        sport: 'Soccer',
        garment: 'Jersey',
        mode: 'DYO',
        kit: c.kit,
        updated: DateTime.now(),
        thumbnail: Uint8List.fromList([1, 2, 3]),
      );
      await browser.writeProject(
        p.id,
        ProjectStore.encode(p),
        ProjectStore.images(p),
      );
      final loaded = (await browser.readProjects()).single;
      final restored = ProjectStore.decode(loaded.$1, loaded.$2);
      expect(restored.title, 'Home');
      expect(restored.kit.layers.single['text'], 'CLUB');
      expect(restored.thumbnail, [1, 2, 3]);
      p.title = 'Away';
      await browser.writeProject(
        p.id,
        ProjectStore.encode(p),
        ProjectStore.images(p),
      );
      expect((await browser.readProjects()).single.$1['title'], 'Away');
      await browser.deleteProject(p.id);
      expect(await browser.readProjects(), isEmpty);
    },
  );

  test(
    'a failed save remains in memory and is never reported as saved',
    () async {
      final c = AppController(store: UnavailableStore());
      addTearDown(c.dispose);
      expect(await c.saveProject('Unsaved kit'), isFalse);
      expect(c.saved, isFalse);
      expect(c.saveError, contains('Storage may be full'));
      expect(c.projects.first.title, 'Unsaved kit');
      expect(c.projects.first.persisted, isFalse);
      expect(c.projects.first.localSaveError, isNotNull);
    },
  );

  test('one broken browser entry does not hide other saved projects', () async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('3deezi.project.damaged', '{');
    await browser.writeProject('good', {'id': 'good'}, {});
    expect((await browser.readProjects()).single.$1['id'], 'good');
  });
}
