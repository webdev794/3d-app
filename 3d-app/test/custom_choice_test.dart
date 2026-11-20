import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:three_deezi/app_controller.dart';
import 'package:three_deezi/custom_choice.dart';
import 'package:three_deezi/project_sync.dart';

/// "Custom…" in the Sport and Garment pickers (client 2026-11-02): a typed
/// garment uses the nearest 3D garment, a typed sport syncs as
/// design.sportName under Training (as the website's customChoice.ts).
void main() {
  test('a typed garment uses the nearest 3D garment', () {
    expect(nearestGarment('Snapback cap'), 'Cap');
    expect(nearestGarment('Beanie'), 'Cap');
    expect(nearestGarment('Bucket hat'), 'Bucket hat');
    expect(nearestGarment('Crew socks'), 'Socks');
    expect(nearestGarment('Board shorts'), 'Shorts');
    expect(nearestGarment('Tennis skort'), 'Skirt');
    expect(nearestGarment('Dance dress'), 'Netball dress');
    expect(nearestGarment('Golf polo'), 'Polo');
    expect(nearestGarment('Hooded top'), 'Hoodie');
    expect(nearestGarment('Spray jacket'), 'Track jacket');
    expect(nearestGarment('Running vest'), 'Singlet');
    expect(nearestGarment('Bowling t-shirt'), 'Training Tee');
    expect(nearestGarment('Bowling shirt'), 'Jersey');
    // Only from the garments a picker offers.
    expect(nearestGarment('Cap', ['Jersey', 'Polo']), 'Jersey');
    expect(nearestOrderGarment('Spray jacket'), 'jacket');
    expect(nearestOrderGarment('Bowling shirt'), 'other');
  });

  test('a typed name is plain text, up to 40 characters', () {
    expect(typedName('  <b>Bowling</b>  club'), 'bBowling/b club');
    expect(customName('  Lawn   darts  '), 'Lawn darts');
    expect(customName('x' * 50).length, customMax);
  });

  test('a typed sport syncs as design.sportName under Training', () {
    final kit = KitState(
      garment: 'Cap',
      mainColor: const Color(0xff0b1016),
      secondaryColor: const Color(0xff00c2cc),
      accentColor: const Color(0xff36e3ee),
      pattern: 'Solid',
      fabric: 'Standard',
      logoText: '',
      backName: '',
      number: '',
      patternTile: null,
      logoImage: null,
      spec: null,
      productName: 'Snapback cap',
    );
    final p = Project(
      id: 'p1',
      title: 'Mantis caps',
      sport: 'Bowling',
      garment: 'Cap',
      mode: 'DYO',
      updated: DateTime(2026, 11, 2),
      kit: kit,
    );
    final body = ProjectSync.toServer(p);
    expect(body['sport'], 'training');
    expect(body['design']['sportName'], 'Bowling');
    expect(body['design']['productName'], 'Snapback cap');
    // A listed sport sends no sportName.
    final listed = ProjectSync.toServer(
      Project(
        id: 'p2',
        title: 'Kit',
        sport: 'Rugby League',
        garment: 'Jersey',
        mode: 'DYO',
        updated: DateTime(2026, 11, 2),
        kit: kit,
      ),
    );
    expect(listed['sport'], 'rugby-league');
    expect((listed['design'] as Map).containsKey('sportName'), isFalse);
    // Back from the server (a website save has no design.app).
    final back = ProjectSync.fromServer({
      'id': 7,
      'name': 'Mantis caps',
      'sport': 'training',
      'garment': 'cap',
      'design': {...(body['design'] as Map<String, dynamic>)}..remove('app'),
    });
    expect(back.sport, 'Bowling');
    expect(back.kit.productName, 'Snapback cap');
  });
}
