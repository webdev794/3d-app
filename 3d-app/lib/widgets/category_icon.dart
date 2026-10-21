import 'package:flutter/material.dart';

/// The DYO quick-access symbols: plain 2D outlines on a 48-unit grid, all
/// drawn with one stroke width so the tiles match. Sports are their ball or
/// posts; apparel is its garment. The website draws the same SVG paths
/// (website/resources/js/components/GarmentIcon.tsx): change both together.
const categoryOutlines = <String, String>{
  'rugby':
      'M8.5 39.5A26.02 26.02 0 0 1 39.5 8.5A26.02 26.02 0 0 1 8.5 39.5ZM15 33L33 15M18.14 25.34L22.66 29.86M21.74 21.74L26.26 26.26M25.34 18.14L29.86 22.66',
  'rugby-posts':
      'M11 44L11 5M37 44L37 5M11 30L37 30M17.5 22.5A10.73 10.73 0 0 1 30.5 9.5A10.73 10.73 0 0 1 17.5 22.5ZM22.44 14.44L25.56 17.56',
  'football':
      'M4.5 24A19.5 19.5 0 1 0 43.5 24A19.5 19.5 0 1 0 4.5 24ZM24 17.4L30.28 21.96L27.88 29.34L20.12 29.34L17.72 21.96ZM24 17.4L24 11.2M24 11.2L15.15 6.63M24 11.2L32.85 6.63M30.28 21.96L36.17 20.04M36.17 20.04L37.79 10.21M36.17 20.04L43.26 27.05M27.88 29.34L31.52 34.36M31.52 34.36L41.37 32.85M31.52 34.36L27.05 43.26M20.12 29.34L16.48 34.36M16.48 34.36L20.95 43.26M16.48 34.36L6.63 32.85M17.72 21.96L11.83 20.04M11.83 20.04L4.74 27.05M11.83 20.04L10.21 10.21',
  'basketball':
      'M4.5 24A19.5 19.5 0 1 0 43.5 24A19.5 19.5 0 1 0 4.5 24ZM24 4.5L24 43.5M4.5 24L43.5 24M10.21 10.21Q21.5 24 10.21 37.79M37.79 10.21Q26.5 24 37.79 37.79',
  'netball':
      'M7 10.5A9.5 2.8 0 1 0 26 10.5A9.5 2.8 0 1 0 7 10.5ZM26 10.5L34 10.5M34 5L34 44M28 44L40 44M7.5 12L10.5 23.5M25.5 12L22.5 23.5M10.5 23.5L22.5 23.5M11 13L19 23.5M22 13L14 23.5M8.4 36A6.6 6.6 0 1 0 21.6 36A6.6 6.6 0 1 0 8.4 36ZM8.6 34.4Q15 37.5 21.4 34.4M13.4 29.6Q11.5 36 14.6 42.6',
  'afl':
      'M12 44L12 5M36 44L36 5M4 44L4 19M44 44L44 19M19.5 35A18.36 18.36 0 0 1 28.5 9A18.36 18.36 0 0 1 19.5 35ZM21.5 29.2L26.5 14.8M20.33 25.24L24.87 26.82M21.73 21.21L26.27 22.79M23.13 17.18L27.67 18.76',
  'hockey':
      'M9 5L29.5 32Q31.2 34.6 34.2 34.6H42.5M39 5L18.5 32Q16.8 34.6 13.8 34.6H5.5M18.4 41.5A5.6 2.5 0 1 0 29.6 41.5A5.6 2.5 0 1 0 18.4 41.5Z',
  'tee':
      'M17 7L9 10.5L4 19L10 23.5L13 21.5V43H35V21.5L38 23.5L44 19L39 10.5L31 7Q28.5 11.5 24 11.5Q19.5 11.5 17 7Z',
  'polo':
      'M17 7L9 10.5L4 19L10 23.5L13 21.5V43H35V21.5L38 23.5L44 19L39 10.5L31 7L24 12ZM17 7L20.5 14.5L24 12L27.5 14.5L31 7M24 12L24 20M13 29L35 29M13 35L35 35',
  'hoodie':
      'M16.5 12L9.5 15Q6.6 16.4 6.4 20L5 40H11.2L12.5 24V43H35.5V24L36.8 40H43L41.6 20Q41.4 16.4 38.5 15L31.5 12M16.5 12Q16 4 24 4Q32 4 31.5 12Q28.5 17 24 17Q19.5 17 16.5 12ZM24 17L24 43M21 16.5L21 22M27 16.5L27 22M15.5 32L19 37.5M32.5 32L29 37.5',
  'jacket':
      'M16.5 10L9.5 13Q6.6 14.4 6.4 18L5 40H11.2L12.5 24V43H35.5V24L36.8 40H43L41.6 18Q41.4 14.4 38.5 13L31.5 10M16.5 10L17.5 4.5H30.5L31.5 10M24 4.5L24 43M15.5 30L19.5 35.5M32.5 30L28.5 35.5',
  'singlet':
      'M15.5 5Q16.5 15 24 15Q31.5 15 32.5 5H36.5Q36.5 14 40 18.5V43H8V18.5Q11.5 14 11.5 5Z',
  'shirt':
      'M16.5 8L9.5 11Q6.6 12.4 6.4 16L5 40H11.2L12.5 24V43H35.5V24L36.8 40H43L41.6 16Q41.4 12.4 38.5 11L31.5 8M16.5 8L20.5 15L24 11L27.5 15L31.5 8M24 11L24 43M27.5 21H32.5V27H27.5Z',
};

/// Which outline each category uses (by the website's category id); a new
/// category falls back to the tee.
const _categorySymbol = <String, String>{
  'rugby-league': 'rugby',
  'rugby-union': 'rugby-posts',
  'football': 'football',
  'soccer': 'football',
  'basketball': 'basketball',
  'netball': 'netball',
  'afl': 'afl',
  'hockey': 'hockey',
  'training': 'hoodie',
  'hoodies': 'hoodie',
  'jackets': 'jacket',
  'gymwear': 'singlet',
  'hi-vis': 'polo',
  'workwear': 'shirt',
};

/// A category's outline symbol, [size] square, in [color].
class CategoryIcon extends StatelessWidget {
  const CategoryIcon(
    this.category, {
    super.key,
    this.size = 36,
    this.color = const Color(0xff19e3f2),
  });
  final String category;
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => CustomPaint(
    size: Size.square(size),
    painter: _OutlinePainter(
      categoryOutlines[_categorySymbol[category] ?? category] ??
          categoryOutlines['tee']!,
      color,
    ),
  );
}

class _OutlinePainter extends CustomPainter {
  _OutlinePainter(this.data, this.color);
  final String data;
  final Color color;
  static final _cache = <String, Path>{};

  @override
  void paint(Canvas canvas, Size size) {
    final path = _cache.putIfAbsent(data, () => parseSvgPath(data));
    canvas.save();
    canvas.scale(size.width / 48, size.height / 48);
    canvas.drawPath(
      path,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.4
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..color = color,
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(_OutlinePainter old) =>
      old.data != data || old.color != color;
}

/// A small SVG path reader for the outlines above: absolute M, L, H, V, C,
/// Q, A and Z (the commands they use), with repeated coordinates allowed.
Path parseSvgPath(String d) {
  final tokens = RegExp(
    r'[MLHVCQAZmlhvcqaz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?',
  ).allMatches(d).map((m) => m.group(0)!).toList();
  final path = Path();
  var i = 0;
  var cmd = '';
  var x = 0.0, y = 0.0, startX = 0.0, startY = 0.0;
  bool isNum(int k) =>
      k < tokens.length && !RegExp(r'^[A-Za-z]$').hasMatch(tokens[k]);
  double n() => double.parse(tokens[i++]);
  while (i < tokens.length) {
    if (!isNum(i)) cmd = tokens[i++];
    switch (cmd) {
      case 'M':
        x = n();
        y = n();
        startX = x;
        startY = y;
        path.moveTo(x, y);
        cmd = 'L'; // Further pairs are lines.
      case 'L':
        x = n();
        y = n();
        path.lineTo(x, y);
      case 'H':
        x = n();
        path.lineTo(x, y);
      case 'V':
        y = n();
        path.lineTo(x, y);
      case 'C':
        final c = [n(), n(), n(), n()];
        x = n();
        y = n();
        path.cubicTo(c[0], c[1], c[2], c[3], x, y);
      case 'Q':
        final c = [n(), n()];
        x = n();
        y = n();
        path.quadraticBezierTo(c[0], c[1], x, y);
      case 'A':
        final rx = n(), ry = n(), rotation = n();
        final large = n() != 0, sweep = n() != 0;
        x = n();
        y = n();
        path.arcToPoint(
          Offset(x, y),
          radius: Radius.elliptical(rx, ry),
          rotation: rotation,
          largeArc: large,
          clockwise: sweep,
        );
      case 'Z':
      case 'z':
        path.close();
        x = startX;
        y = startY;
      default:
        throw FormatException('Unsupported path command "$cmd"', d);
    }
  }
  return path;
}
