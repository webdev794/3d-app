import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../app_controller.dart';
import 'ui.dart';

/// How a word on the kit looks (task 9.146, the website's WordLook.tsx; the
/// viewer's wordart.js draws it on the kit): style tiles (Plain, Outline,
/// Shadow, 3D block, Contour), shape tiles (Straight, Arch up, Arch down,
/// Wave, Bridge, Slant), size and letter spacing. Kept in
/// `marks[markKey]['look']` (and 'scale' for the size).
const wordStyles = [
  ('plain', 'Plain'),
  ('outline', 'Outline'),
  ('shadow', 'Shadow'),
  ('extrude', '3D block'),
  ('contour', 'Contour'),
];
const wordShapes = [
  ('straight', 'Straight'),
  ('archUp', 'Arch up'),
  ('archDown', 'Arch down'),
  ('wave', 'Wave'),
  ('bridge', 'Bridge'),
  ('slant', 'Slant'),
];

Color _darker(Color c) => Color.lerp(c, Colors.black, .5)!;
String _hex(Color c) =>
    '#${(c.toARGB32() & 0xffffff).toRadixString(16).padLeft(6, '0')}';
Color? _colour(Object? v) {
  if (v is! String || !RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(v)) return null;
  return Color(0xff000000 | int.parse(v.substring(1), radix: 16));
}

class WordLookEditor extends StatelessWidget {
  const WordLookEditor({
    super.key,
    required this.c,
    required this.markKey,
    required this.word,
    required this.title,
  });
  final AppController c;
  final String markKey, word, title;

  Map<String, dynamic> get _mark =>
      Map<String, dynamic>.from(c.marks[markKey] as Map? ?? const {});
  Map<String, dynamic> get _look =>
      Map<String, dynamic>.from(_mark['look'] as Map? ?? const {});

  void _patch(Map<String, dynamic> next, {bool live = false}) {
    final mark = {..._mark, ...next}..removeWhere((_, v) => v == null);
    void change() => c.marks = {...c.marks, markKey: mark};
    live ? c.update(change) : c.edit(change);
  }

  void _setLook(Map<String, dynamic> next, {bool live = false}) => _patch({
    'look': {..._look, ...next},
  }, live: live);

  @override
  Widget build(BuildContext context) {
    final look = _look, mark = _mark;
    final style = look['style'] as String? ?? 'plain';
    final shape = look['shape'] as String? ?? 'straight';
    Widget tiles(List<(String, String)> list, String field, String now) => Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final (id, label) in list)
          _Tile(
            key: ValueKey('word-$markKey-$field-$id'),
            label: label,
            selected: now == id,
            painter: _WordPainter(
              word.isEmpty ? 'TEAM' : word,
              {...look, field: id},
              c.mainColor,
              c.accentColor,
            ),
            onTap: () => _setLook({field: id}),
          ),
      ],
    );
    final width = (look['width'] as num?)?.toDouble() ?? .08;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionLabel('${title.toUpperCase()} STYLE'),
        tiles(wordStyles, 'style', style),
        SectionLabel('${title.toUpperCase()} SHAPE'),
        tiles(wordShapes, 'shape', shape),
        Text('Size', style: Theme.of(context).textTheme.bodySmall),
        Slider(
          value: ((mark['scale'] as num?)?.toDouble() ?? 1).clamp(.5, 2),
          min: .5,
          max: 2,
          onChanged: (v) => _patch({'scale': v}, live: true),
          onChangeEnd: (v) => _patch({'scale': v}),
        ),
        Text('Letter spacing', style: Theme.of(context).textTheme.bodySmall),
        Slider(
          value: ((look['spacing'] as num?)?.toDouble() ?? 0).clamp(-.1, .6),
          min: -.1,
          max: .6,
          onChanged: (v) => _setLook({'spacing': v}, live: true),
          onChangeEnd: (v) => _setLook({'spacing': v}),
        ),
        if (style != 'plain') ...[
          Text(
            style == 'shadow'
                ? 'Shadow size'
                : style == 'extrude'
                ? 'Block depth'
                : 'Line thickness',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          Slider(
            value: width.clamp(0, .3),
            max: .3,
            onChanged: (v) => _setLook({'width': v}, live: true),
            onChangeEnd: (v) => _setLook({'width': v}),
          ),
          Wrap(
            spacing: 8,
            children: [
              for (final col in [
                _darker(c.mainColor),
                Colors.black,
                Colors.white,
                c.accentColor,
                c.secondaryColor,
              ])
                GestureDetector(
                  onTap: () => _setLook({'color': _hex(col)}),
                  child: Container(
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(
                      color: col,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: _hex(col) == look['color']
                            ? const Color(0xff2fd0e0)
                            : Colors.white24,
                        width: 2,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
        if (mark['look'] != null)
          TextButton(
            onPressed: () => _patch({'look': null, 'scale': null}),
            child: Text('Back to the plain ${title.toLowerCase()}'),
          ),
      ],
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({
    super.key,
    required this.label,
    required this.selected,
    required this.painter,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final CustomPainter painter;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Semantics(
    button: true,
    selected: selected,
    label: label,
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        width: 92,
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: selected ? const Color(0xff2fd0e0) : Colors.white24,
            width: selected ? 2 : 1,
          ),
        ),
        child: Column(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: CustomPaint(size: const Size(84, 46), painter: painter),
            ),
            const SizedBox(height: 2),
            Text(label, style: const TextStyle(fontSize: 11)),
          ],
        ),
      ),
    ),
  );
}

/// The viewer's drawWord, for the tiles.
class _WordPainter extends CustomPainter {
  _WordPainter(this.word, this.look, this.main, this.accent);
  final String word;
  final Map<String, dynamic> look;
  final Color main, accent;

  TextPainter _tp(
    String ch,
    double size, {
    Paint? stroke,
    Color? color,
    List<Shadow>? shadows,
  }) => TextPainter(
    text: TextSpan(
      text: ch,
      style: TextStyle(
        fontFamily: 'Rajdhani',
        fontWeight: FontWeight.w700,
        fontSize: size,
        height: 1,
        foreground: stroke,
        color: stroke == null ? color : null,
        shadows: shadows,
      ),
    ),
    textDirection: TextDirection.ltr,
  )..layout();

  @override
  void paint(Canvas canvas, Size s) {
    canvas.drawRect(Offset.zero & s, Paint()..color = main);
    final style = look['style'] as String? ?? 'plain';
    final shape = look['shape'] as String? ?? 'straight';
    final width = ((look['width'] as num?)?.toDouble() ?? .08).clamp(0, .3);
    final spacing = ((look['spacing'] as num?)?.toDouble() ?? 0).clamp(-.1, .6);
    final line = _colour(look['color']) ?? _darker(main);
    const size = 18.0;
    final chars = word.characters.toList();
    final widths = [for (final ch in chars) _tp(ch, size).width];
    final gap = spacing * size;
    final total =
        widths.fold<double>(0, (a, b) => a + b) +
        gap * math.max(0, chars.length - 1);
    final k = total > s.width - 10 ? (s.width - 10) / total : 1.0;
    canvas.save();
    canvas.translate(s.width / 2, s.height / 2);
    canvas.scale(k, 1);
    if (shape == 'slant') {
      canvas.transform(
        Float64List.fromList([
          1,
          0,
          0,
          0,
          -.32,
          1,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          0,
          1,
        ]),
      );
    }
    final r = math.max(total, size) * .85;
    final places = <List<double>>[];
    var u = -total / 2;
    for (var i = 0; i < chars.length; i++) {
      final c = u + widths[i] / 2;
      var x = c, y = 0.0, a = 0.0, sy = 1.0;
      if (shape == 'archUp' || shape == 'archDown') {
        final t = c / r, dir = shape == 'archUp' ? 1 : -1;
        x = r * math.sin(t);
        y =
            dir * r * (1 - math.cos(t)) -
            dir * r * (1 - math.cos(total / 2 / r)) / 2;
        a = dir * t;
      } else if (shape == 'wave') {
        final f = math.pi * 3 / math.max(total, 1e-6);
        y = size * .16 * math.sin(c * f);
        a = math.atan(size * .16 * f * math.cos(c * f));
      } else if (shape == 'bridge') {
        sy = 1 + .5 * math.cos(math.pi * c / math.max(total, 1e-6));
      }
      places.add([x, y, a, sy]);
      u += widths[i] + gap;
    }
    void each(TextPainter Function(String) make, [Offset shift = Offset.zero]) {
      for (var i = 0; i < chars.length; i++) {
        final p = places[i], tp = make(chars[i]);
        canvas.save();
        canvas.translate(p[0] + shift.dx, p[1] + shift.dy);
        canvas.rotate(p[2]);
        if (p[3] != 1) {
          canvas.translate(0, size * .5);
          canvas.scale(1, p[3]);
          canvas.translate(0, -size * .5);
        }
        tp.paint(canvas, Offset(-tp.width / 2, -tp.height / 2));
        canvas.restore();
      }
    }

    Paint stroke(Color c, double w) => Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = w
      ..strokeJoin = StrokeJoin.round
      ..color = c;
    if (style == 'extrude') {
      final d = size * math.max(.02, width * .9) / 8;
      for (var st = 8; st >= 1; st--) {
        each((ch) => _tp(ch, size, color: line), Offset(st * d, st * d));
      }
    }
    if (style == 'contour') {
      final w = size * math.max(.03, width);
      each((ch) => _tp(ch, size, stroke: stroke(line, w * 3.2)));
      each((ch) => _tp(ch, size, stroke: stroke(main, w * 1.9)));
      each((ch) => _tp(ch, size, stroke: stroke(line, w * .9)));
    }
    if (style == 'outline' && width > 0) {
      each((ch) => _tp(ch, size, stroke: stroke(line, size * width * 2)));
    }
    if (style == 'plain') {
      each((ch) => _tp(ch, size, stroke: stroke(_darker(main), size * .07)));
    }
    final shadow = style == 'shadow'
        ? [
            Shadow(
              color:
                  _colour(look['color'])?.withValues(alpha: .8) ??
                  Colors.black54,
              blurRadius: size * math.max(.04, width),
              offset: Offset(size * math.max(.04, width), size * math.max(.04, width)),
            ),
          ]
        : null;
    each((ch) => _tp(ch, size, color: accent, shadows: shadow));
    canvas.restore();
  }

  @override
  bool shouldRepaint(_WordPainter old) =>
      old.word != word ||
      old.main != main ||
      old.accent != accent ||
      old.look.toString() != look.toString();
}
