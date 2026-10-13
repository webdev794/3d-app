import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/ai_service.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/project_store.dart';

/// In-memory store standing in for the device file system.
class FakeStore extends ProjectStore {
  final saved = <String, Project>{};
  final deleted = <String>[];
  List<Project> onDisk = [];

  @override
  Future<void> save(Project project) async => saved[project.id] = project;

  @override
  Future<List<Project>> loadAll() async => onDisk;

  @override
  Future<void> delete(String id) async => deleted.add(id);
}

Uint8List bytes(int seed) =>
    Uint8List.fromList(List.generate(64, (i) => (i * seed) & 255));

void main() {
  test('a saved project survives encode -> JSON -> decode', () {
    const spec = DesignSpec(
      designName: 'Razor Rush',
      detected: 'Rugby League Jersey',
      summary: 'Sharp black and cyan kit.',
      findings: ['Bold contrast'],
      mainColor: Color(0xff0b1016),
      secondaryColor: Color(0xff00c2cc),
      accentColor: Color(0xff36e3ee),
      pattern: 'Chevron',
      fabric: 'Pro',
      logoText: 'MANTIS',
      renderPrompt: 'Black jersey with cyan chevrons.',
      patternMotif: 'interlocking chevrons',
      sport: 'Rugby League',
      garment: 'Jersey',
    );
    final project = Project(
      id: 'p123',
      title: 'Thunder Home',
      sport: 'Rugby League',
      garment: 'Jersey',
      mode: 'AI',
      version: 3,
      updated: DateTime.utc(2026, 10, 8, 9, 30),
      brief: 'Black and cyan, aggressive',
      thumbnail: bytes(3),
      renderFront: bytes(5),
      kit: KitState(
        garment: 'Jersey',
        mainColor: const Color(0xff0b1016),
        secondaryColor: const Color(0xff00c2cc),
        accentColor: const Color(0xff36e3ee),
        pattern: 'Chevron',
        fabric: 'Pro',
        logoText: 'MANTIS',
        backName: 'SMITH',
        number: '7',
        patternTile: bytes(7),
        logoImage: bytes(11),
        sponsorImage: bytes(13),
        spec: spec,
      ),
    );

    final json = jsonDecode(jsonEncode(ProjectStore.encode(project)));
    final back = ProjectStore.decode(json, ProjectStore.images(project));

    expect(back.id, 'p123');
    expect(back.title, 'Thunder Home');
    expect(back.version, 3);
    expect(back.updated, project.updated);
    expect(back.persisted, isTrue);
    expect(back.kit.mainColor, project.kit.mainColor);
    expect(back.kit.backName, 'SMITH');
    expect(back.kit.number, '7');
    expect(back.kit.sponsorImage, project.kit.sponsorImage);
    expect(back.kit.logoImage, project.kit.logoImage);
    expect(back.renderFront, project.renderFront);
    expect(back.kit.spec!.designName, 'Razor Rush');
    expect(back.kit.spec!.secondaryColor, const Color(0xff00c2cc));
    expect(back.kit.spec!.patternMotif, 'interlocking chevrons');
  });

  test(
    'restored projects replace their samples; save and delete reach the store',
    () async {
      final store = FakeStore();
      final c = AppController(store: store);
      final sampleCount = c.projects.length;
      store.onDisk = [
        Project(
          id: 'sample-1',
          title: 'Warriors Concept (edited)',
          sport: 'Rugby League',
          garment: 'Jersey',
          mode: 'AI',
          version: 2,
          updated: DateTime.now(),
          kit: c.kit,
          persisted: true,
        ),
      ];
      await c.restoreProjects();
      expect(c.projects, hasLength(sampleCount));
      expect(c.projects.first.title, 'Warriors Concept (edited)');

      c.startDyo();
      c.saveProject('Thunder Home');
      await Future<void>.delayed(Duration.zero);
      expect(store.saved.values.single.title, 'Thunder Home');
      expect(c.projects.first.persisted, isTrue);

      final id = c.projects.first.id;
      c.deleteProject(c.projects.first);
      expect(c.projects.where((p) => p.id == id), isEmpty);
      expect(store.deleted, [id]);
    },
  );

  test('sponsor logo is part of undo/redo', () {
    final c = AppController(store: FakeStore());
    final logo = bytes(17);
    c.edit(() => c.sponsorImage = logo);
    expect(c.sponsorImage, logo);
    c.undo();
    expect(c.sponsorImage, isNull);
    c.redo();
    expect(c.sponsorImage, logo);
  });
}
