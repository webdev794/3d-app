import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../app_controller.dart';
import '../garment_style.dart';
import '../part_editing.dart';
import '../project_sync.dart';
import 'flow_ui.dart';
import 'ui.dart';

/// The Studio's Style tool (client mockups images/299 and 300), as the
/// website's: the neck style cards (round / V), the neck trim colour and, on
/// rugby jerseys, the rugby collar library, the collar colour and the fit; a
/// NECK DETAIL close-up from the 3D kit. Every change keeps the design.
class GarmentStyleTool extends StatelessWidget {
  const GarmentStyleTool(
    this.c, {
    super.key,
    required this.onGarment,
    required this.onMoreColours,
  });
  final AppController c;
  final VoidCallback onGarment, onMoreColours;

  String get _product => c.productName.isNotEmpty ? c.productName : c.garment;

  void _setNeck(String id) => c.edit(
    // A V is kept as chosen: the 3D gives it its own deep, pointed V.
    () => c.neck = id == ownNeck(c.garment, c.zoneColors) && id != 'v'
        ? null
        : id,
  );

  String get _trim {
    final own = c.partStyleOf('collar').colour;
    return own ?? ProjectSync.hex(c.secondaryColor);
  }

  void _setTrim(String hex) {
    final s = c.partStyleOf('collar');
    c.setPartStyle(
      'collar',
      PartStyle(
        colour: hex,
        fade: s.fade,
        pattern: s.pattern,
        patternColour: s.patternColour,
        patternOpacity: s.patternOpacity,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final neck = neckOf(c.garment, c.neck, c.zoneColors);
    final rugby = hasRugbyStyle(c.sport, c.garment);
    final collar = isRugbyCollar(c.neck);
    final trim = _trim.toLowerCase();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionLabel('Product'),
        OutlinedButton(
          key: const ValueKey('style-product'),
          onPressed: onGarment,
          child: Row(
            children: [
              Expanded(child: Text(_product, overflow: TextOverflow.ellipsis)),
              const Icon(Icons.expand_more, size: 18),
            ],
          ),
        ),
        if (!hasNeckStyle(c.garment))
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(
              '${c.garment == 'Track jacket' ? 'The track jacket comes with a stand-up collar or a hood: choose it in Patterns.' : 'The ${_product.toLowerCase()} keeps its own collar.'} Neck styles: jerseys, tees, singlets and shooting shirts.',
              style: const TextStyle(color: Palette.muted, fontSize: 12),
            ),
          )
        else ...[
          NeckDetail(c, key: const ValueKey('neck-detail')),
          const SectionLabel('Neck style'),
          Row(
            children: [
              for (final id in const ['round', 'v'])
                Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(right: id == 'round' ? 10 : 0),
                    child: _NeckCard(
                      key: ValueKey('neck-$id'),
                      id: id,
                      label: neckLabels[id]!.toUpperCase(),
                      selected: neck == id,
                      c: c,
                      onTap: () => _setNeck(id),
                    ),
                  ),
                ),
            ],
          ),
          if (neck != null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Row(
                children: [
                  const Icon(Icons.check_circle, color: Palette.cyan, size: 17),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      '${neckLabel(c.garment, c.neck, c.zoneColors)} selected',
                      style: const TextStyle(
                        color: Palette.cyan,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          const Padding(
            padding: EdgeInsets.only(top: 4),
            child: Text(
              'Available styles vary by garment.',
              style: TextStyle(color: Palette.muted, fontSize: 12),
            ),
          ),
          if (rugby) ...[
            const SectionLabel('Rugby collar options'),
            GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: 1.05,
              children: [
                for (final (id, code, _) in rugbyCollars)
                  _NeckCard(
                    key: ValueKey('collar-$id'),
                    id: id,
                    label: id == 'shallow-v' ? 'SHALLOW V' : code,
                    selected: neck == id,
                    c: c,
                    onTap: () => _setNeck(id),
                  ),
              ],
            ),
            if (collar)
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  'Final shape to match supplier pattern.',
                  style: TextStyle(color: Palette.muted, fontSize: 12),
                ),
              ),
          ],
          SectionLabel(rugby ? 'Collar colour' : 'Neck trim'),
          Row(
            children: [
              for (final (hex, label) in trimSwatches)
                Padding(
                  padding: const EdgeInsets.only(right: 12),
                  child: Semantics(
                    label: label,
                    selected: trim == hex,
                    button: true,
                    child: InkWell(
                      key: ValueKey('trim-$label'),
                      customBorder: const CircleBorder(),
                      onTap: () => _setTrim(hex),
                      child: Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: ProjectSync.color(hex),
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: trim == hex ? Palette.cyan : Colors.white30,
                            width: trim == hex ? 3 : 1.5,
                          ),
                        ),
                        child: trim == hex
                            ? Icon(
                                Icons.check,
                                color: hex == '#111214'
                                    ? Colors.white
                                    : Colors.black,
                              )
                            : null,
                      ),
                    ),
                  ),
                ),
              TextButton(
                key: const ValueKey('trim-more'),
                onPressed: onMoreColours,
                child: const Text('More colours ›'),
              ),
            ],
          ),
          if (rugby) ...[
            const SectionLabel('Fit'),
            for (final (id, label, note) in rugbyFits)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: GlowCard(
                  key: ValueKey('fit-$id'),
                  radius: 10,
                  glow: false,
                  selected: fitOf(c.fit) == id,
                  onTap: () => c.edit(() => c.fit = id == 'pro' ? null : id),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 9,
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            label,
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ),
                        Text(
                          note,
                          style: const TextStyle(
                            color: Palette.muted,
                            fontSize: 11.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ],
        const Padding(
          padding: EdgeInsets.only(top: 14),
          child: Text(
            'Also available on compatible netball dresses and tees.',
            style: TextStyle(color: Palette.muted, fontSize: 12),
          ),
        ),
      ],
    );
  }
}

/// A neck or collar card: a drawing in the kit's own colours and its name.
class _NeckCard extends StatelessWidget {
  const _NeckCard({
    super.key,
    required this.id,
    required this.label,
    required this.selected,
    required this.c,
    required this.onTap,
  });
  final String id, label;
  final bool selected;
  final AppController c;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final own = c.partStyleOf('collar').colour;
    return Semantics(
      selected: selected,
      button: true,
      label: label,
      child: GlowCard(
        radius: 10,
        glow: false,
        selected: selected,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(4, 4, 4, 6),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AspectRatio(
                aspectRatio: 120 / 80,
                child: CustomPaint(
                  painter: _NeckArt(
                    id,
                    body: c.mainColor,
                    trim: own == null
                        ? c.secondaryColor
                        : ProjectSync.color(own),
                    accent: c.accentColor,
                  ),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: .5,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The card's drawing (as the website's NeckArt): the opening, its band and
/// the collar's own pieces.
class _NeckArt extends CustomPainter {
  _NeckArt(
    this.id, {
    required this.body,
    required this.trim,
    required this.accent,
  });
  final String id;
  final Color body, trim, accent;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 120, size.height / 80);
    final v = id == 'v' || id == 'rc004' || id == 'rc007';
    final shallow = id == 'shallow-v';
    final fold = id == 'rc008' || id == 'rc009' || id == 'rc010';
    final band = switch (id) {
      'rc001' || 'rc003' || 'shallow-v' => 9.0,
      'rc005' => 8.0,
      _ => 6.0,
    };
    canvas.drawRect(
      const Rect.fromLTWH(0, 0, 120, 80),
      Paint()..color = const Color(0xff05080c),
    );
    canvas.drawPath(
      Path()
        ..moveTo(0, 22)
        ..quadraticBezierTo(20, 8, 28, 10)
        ..lineTo(92, 10)
        ..quadraticBezierTo(100, 8, 120, 22)
        ..lineTo(120, 80)
        ..lineTo(0, 80)
        ..close(),
      Paint()..color = body,
    );
    final open = Path()..moveTo(28, 14);
    if (v || shallow) {
      open
        ..lineTo(60, shallow ? 50 : 64)
        ..lineTo(92, 14);
    } else {
      open.quadraticBezierTo(60, 72, 92, 14);
    }
    canvas.drawPath(
      Path.from(open)
        ..quadraticBezierTo(60, 2, 28, 14)
        ..close(),
      Paint()
        ..color = shallow ? const Color(0xffd9dcdf) : const Color(0xff0b0d10),
    );
    if (id == 'rc002') {
      canvas.drawPath(
        Path()
          ..moveTo(40, 22)
          ..lineTo(60, 52)
          ..lineTo(80, 22)
          ..close(),
        Paint()..color = accent,
      );
    }
    if (id == 'rc006' || id == 'rc007' || id == 'rc008' || id == 'rc009') {
      final top = id == 'rc007' ? 60.0 : 36.0;
      final n = id == 'rc008' ? 3 : 1;
      canvas.drawRect(
        Rect.fromLTWH(56, top, 8, n > 1 ? 34 : 22),
        Paint()..color = accent,
      );
      for (var i = 0; i < n; i++) {
        canvas.drawCircle(
          Offset(60, top + 6 + i * 10),
          2,
          Paint()..color = const Color(0xffdfe6ea),
        );
      }
    }
    final stroke = Paint()
      ..color = trim
      ..style = PaintingStyle.stroke
      ..strokeWidth = band;
    canvas.drawPath(open, stroke);
    canvas.drawPath(
      Path()
        ..moveTo(28, 14)
        ..quadraticBezierTo(60, 2, 92, 14),
      stroke..strokeWidth = band * .8,
    );
    if (id == 'rc001' || id == 'rc003' || id == 'shallow-v') {
      canvas.drawPath(
        open.shift(const Offset(0, -2.4)),
        Paint()
          ..color = id == 'rc001' ? body : accent
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2,
      );
    }
    if (id == 'rc002' || id == 'rc005') {
      final tip = Paint()
        ..color = accent
        ..strokeWidth = 5;
      canvas.drawLine(const Offset(22, 18), const Offset(32, 12), tip);
      canvas.drawLine(const Offset(98, 18), const Offset(88, 12), tip);
    }
    if (id == 'rc006') {
      canvas.drawPath(
        Path()
          ..moveTo(26, 14)
          ..quadraticBezierTo(60, 0, 94, 14)
          ..lineTo(94, 6)
          ..quadraticBezierTo(60, -8, 26, 6)
          ..close(),
        Paint()..color = trim,
      );
    }
    if (id == 'rc004') {
      final p = Paint()..color = trim;
      canvas.drawPath(
        Path()
          ..moveTo(28, 14)
          ..lineTo(46, 38)
          ..lineTo(36, 40)
          ..close(),
        p,
      );
      canvas.drawPath(
        Path()
          ..moveTo(92, 14)
          ..lineTo(74, 38)
          ..lineTo(84, 40)
          ..close(),
        p,
      );
    }
    if (fold) {
      if (id == 'rc010') {
        canvas.drawPath(
          Path()
            ..moveTo(44, 24)
            ..lineTo(68, 50)
            ..lineTo(56, 54)
            ..close(),
          Paint()..color = accent,
        );
      }
      final p = Paint()..color = trim;
      canvas.drawPath(
        Path()
          ..moveTo(26, 12)
          ..lineTo(58, 40)
          ..lineTo(40, 46)
          ..lineTo(18, 24)
          ..close(),
        p,
      );
      canvas.drawPath(
        Path()
          ..moveTo(94, 12)
          ..lineTo(62, 40)
          ..lineTo(80, 46)
          ..lineTo(102, 24)
          ..close(),
        p,
      );
    }
  }

  @override
  bool shouldRepaint(_NeckArt old) =>
      old.id != id ||
      old.body != body ||
      old.trim != trim ||
      old.accent != accent;
}

/// NECK DETAIL: the 3D kit's neck close up, its style and "Change style, keep
/// your design." (beside the kit on the website; at the top of the panel here).
class NeckDetail extends StatefulWidget {
  const NeckDetail(this.c, {super.key});
  final AppController c;
  @override
  State<NeckDetail> createState() => _NeckDetailState();
}

class _NeckDetailState extends State<NeckDetail> {
  Uint8List? _shot;
  Timer? _wait;
  String? _asked;
  int _turn = 0;

  String get _signature => [
    widget.c.garment,
    widget.c.neck,
    widget.c.fit,
    widget.c.mainColor,
    widget.c.secondaryColor,
    widget.c.accentColor,
    widget.c.parts['collar'],
    widget.c.pattern,
    widget.c.zones,
    widget.c.viewerReady,
  ].join('|');

  @override
  void initState() {
    super.initState();
    widget.c.addListener(_changed);
    _changed();
  }

  void _changed() {
    final sig = _signature;
    if (sig == _asked) return;
    _asked = sig;
    _wait?.cancel();
    _wait = Timer(const Duration(milliseconds: 650), () async {
      final turn = ++_turn;
      final shot = await widget.c.neckShot?.call();
      if (!mounted || turn != _turn) return;
      setState(() => _shot = shot ?? _shot);
    });
  }

  @override
  void dispose() {
    _wait?.cancel();
    widget.c.removeListener(_changed);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final label = neckLabel(
      widget.c.garment,
      widget.c.neck,
      widget.c.zoneColors,
    );
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: Container(
              width: 104,
              height: 104,
              color: const Color(0xff03060a),
              alignment: Alignment.center,
              child: _shot == null
                  ? const Text(
                      'Neck detail…',
                      style: TextStyle(color: Palette.muted, fontSize: 11),
                    )
                  : Image.memory(
                      _shot!,
                      key: const ValueKey('neck-shot'),
                      fit: BoxFit.cover,
                      gaplessPlayback: true,
                    ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'NECK DETAIL',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1,
                  ),
                ),
                if (label != null)
                  Container(
                    margin: const EdgeInsets.symmetric(vertical: 6),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      border: Border.all(color: Palette.cyan),
                      borderRadius: BorderRadius.circular(99),
                    ),
                    child: Text(
                      label.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                const Text(
                  'Change style, keep your design.',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5),
                ),
                const Text(
                  'Colours, logos and artwork stay in place.',
                  style: TextStyle(color: Palette.muted, fontSize: 11.5),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
