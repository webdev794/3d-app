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
  // Added 2026-10-21 for the new categories (task 9.79).
  'gridiron':
      'M5 33A26.3 26.3 0 0 1 43 15A26.3 26.3 0 0 1 5 33ZM18.68 26.52L29.32 21.48M19.09 23.45L21.31 28.15M21.75 22.19L23.97 26.89M24.03 21.11L26.25 25.81M26.69 19.85L28.91 24.55M9.66 23.18L15.54 35.62M32.46 12.38L38.34 24.82',
  'golf':
      'M30 42L30 4.5M30 4.5L43 9.5L30 14.5M21 42.5A9 2 0 1 0 39 42.5A9 2 0 1 0 21 42.5ZM7.4 31A4.6 4.6 0 1 0 16.6 31A4.6 4.6 0 1 0 7.4 31ZM8.5 37H15.5M12 37V44',
  'tennis':
      'M7 16A11 12 0 1 0 29 16A11 12 0 1 0 7 16ZM13 5.31L13 26.69M18 4L18 28M23 5.31L23 26.69M8.47 10L27.53 10M7 16L29 16M8.47 22L27.53 22M15.5 27.7L17 31V44M20.5 27.7L19 31V44M17 44H19M29.5 35A6.5 6.5 0 1 0 42.5 35A6.5 6.5 0 1 0 29.5 35ZM30.2 32.2Q35 35 32.6 40.6M39.4 29.4Q37 35 41.8 37.8',
  'athletics':
      'M6 11H42V18H6ZM18 11L18 18M30 11L30 18M10 18L10 40M38 18L38 40M5 40L15 40M33 40L43 40M3 45L45 45',
  'swimming':
      'M9 21A6 6 0 1 0 21 21A6 6 0 1 0 9 21ZM9.4 19.5L20.6 19.5M21 26Q27 9 40 14L43 19M4 33Q8 29.5 12 33Q16 36.5 20 33Q24 29.5 28 33Q32 36.5 36 33Q40 29.5 44 33M4 41Q8 37.5 12 41Q16 44.5 20 41Q24 37.5 28 41Q32 44.5 36 41Q40 37.5 44 41',
  'darts':
      'M4 28A16 16 0 1 0 36 28A16 16 0 1 0 4 28ZM10 28A10 10 0 1 0 30 28A10 10 0 1 0 10 28ZM16.5 28A3.5 3.5 0 1 0 23.5 28A3.5 3.5 0 1 0 16.5 28ZM23.5 28L36 28M20 31.5L20 44M16.5 28L4 28M20 24.5L20 18M21.5 26.5L40 8M37.5 10.5L38.5 3.5M37.5 10.5L44.5 9.5',
  'touch':
      'M17 30A16.82 16.82 0 0 1 42 19A16.82 16.82 0 0 1 17 30ZM24 27.2L35 22.8M26.61 23.37L28.39 27.39M28.61 22.49L30.39 26.51M30.61 21.61L32.39 25.63M4 18L14 14M3 26L12 22.5M6 36L13 32.5',
  'cricket':
      'M11 15L11 44M20 15L20 44M29 15L29 44M10 11H19.5M20.5 11H30M34 37A5.5 5.5 0 1 0 45 37A5.5 5.5 0 1 0 34 37ZM35.6 33.1L43.4 40.9M38.93 34.45L36.95 36.43M42.05 37.57L40.07 39.55',
  'softball':
      'M4.5 24A19.5 19.5 0 1 0 43.5 24A19.5 19.5 0 1 0 4.5 24ZM10.5 10Q19 24 10.5 38M37.5 10Q29 24 37.5 38M11.33 15.69L14.69 14.39M12.55 19.86L16.08 19.18M12.95 24L16.55 24M12.55 28.14L16.08 28.82M11.33 32.31L14.69 33.61M33.31 14.39L36.67 15.69M31.92 19.18L35.45 19.86M31.45 24L35.05 24M31.92 28.82L35.45 28.14M33.31 33.61L36.67 32.31',
  'volleyball':
      'M4.5 24A19.5 19.5 0 1 0 43.5 24A19.5 19.5 0 1 0 4.5 24ZM24 24Q26 12 17 5.8M24 24Q13 30 7.5 34.5M24 24Q35 29 42.5 21',
  'cycling':
      'M2.5 33A8.5 8.5 0 1 0 19.5 33A8.5 8.5 0 1 0 2.5 33ZM28.5 33A8.5 8.5 0 1 0 45.5 33A8.5 8.5 0 1 0 28.5 33ZM11 33L18.5 20H31.5L37 33M18.5 20L23.5 33L31.5 20M23.5 33H11M31.5 20L30 14H35.5Q38.5 14 37 18M18.5 20L17 15M14 15H20',
  'bmx':
      'M4 36A7 7 0 1 0 18 36A7 7 0 1 0 4 36ZM30 36A7 7 0 1 0 44 36A7 7 0 1 0 30 36ZM11 36L19 25H31L37 36M19 25L23 36L31 25M23 36H11M31 25L29 12M25 12H34M30 15.5H38V22H31M19 25L17.5 21M14 21H21',
  'lacrosse':
      'M6 44L26 20M26 20Q22 9 31 5Q42 1.5 43.5 9.5Q44.5 17 36 19.5Q30 21 26 20ZM28 11L40 17M33 6L34 19M39 4.5L29 18M7 15A4 4 0 1 0 15 15A4 4 0 1 0 7 15Z',
  'esports':
      'M14 15H34Q42 15 44 27Q45.5 37 39.5 37Q35.5 37 32.5 31H15.5Q12.5 37 8.5 37Q2.5 37 4 27Q6 15 14 15ZM13 20.5L13 27.5M9.5 24L16.5 24M32.4 21.5A1.6 1.6 0 1 0 35.6 21.5A1.6 1.6 0 1 0 32.4 21.5ZM36.4 25.5A1.6 1.6 0 1 0 39.6 25.5A1.6 1.6 0 1 0 36.4 25.5ZM21 22L27 22',
  'glove':
      'M15 26Q12 7 27 6Q40 5 40 20V29Q40 34 34 35.5V44H16V35.5Q9 33 9 27Q9 21 14 21Q19 21 20.5 27Q22 31 28 30M16 38.5L34 38.5',
  'fish':
      'M4 26Q17 11 32 26Q17 41 4 26ZM32 26L42 18V34ZM9.1 24A1.4 1.4 0 1 0 11.9 24A1.4 1.4 0 1 0 9.1 24ZM16 20Q18.5 26 16 32M36 3V9.5Q36 13 32.5 13Q29.5 13 29.5 10',
  'leavers':
      'M24 8L44 17L24 26L4 17ZM12 21V31Q24 37.5 36 31V21M44 17V29M42 34L44 29L46 34',
  'club-polo':
      'M17 7L9 10.5L4 19L10 23.5L13 21.5V43H35V21.5L38 23.5L44 19L39 10.5L31 7L24 12ZM17 7L20.5 14.5L24 12L27.5 14.5L31 7M24 12L24 20M27.5 20H32V23.5Q32 26 29.75 27Q27.5 26 27.5 23.5Z',
  'bowls':
      'M4 26A15 15 0 1 0 34 26A15 15 0 1 0 4 26ZM13 26A6 6 0 1 0 25 26A6 6 0 1 0 13 26ZM16.8 26A2.2 2.2 0 1 0 21.2 26A2.2 2.2 0 1 0 16.8 26ZM35 39.5A4.5 4.5 0 1 0 44 39.5A4.5 4.5 0 1 0 35 39.5Z',
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
  'american-football': 'gridiron',
  'golf': 'golf',
  'tennis': 'tennis',
  'athletics': 'athletics',
  'swimming': 'swimming',
  'darts': 'darts',
  'touch': 'touch',
  'cricket': 'cricket',
  'softball': 'softball',
  'volleyball': 'volleyball',
  'lacrosse': 'lacrosse',
  'cycling': 'cycling',
  'bmx': 'bmx',
  'lawn-bowls': 'bowls',
  'esports': 'esports',
  'fight-wear': 'glove',
  'fishing': 'fish',
  'teamwear': 'club-polo',
  'school-leavers': 'leavers',
};

/// The outline a category id draws (its own id when it has no entry).
String categorySymbol(String category) =>
    _categorySymbol[category] ?? category;

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
      categoryOutlines[categorySymbol(category)] ??
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
