import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui';

/// A brush mark or a note on a picture in the image editor, in fractions of
/// the picture (0 to 1), so it fits every version of the picture.
sealed class EditMark {}

/// A Markup stroke (where to change) or an Erase stroke (brushed out).
class StrokeMark extends EditMark {
  StrokeMark({required this.erase, required this.size, List<Offset>? points})
    : points = points ?? [];

  final bool erase;

  /// The brush width as a fraction of the picture's width.
  final double size;
  final List<Offset> points;
}

/// A Comment: a short note at a spot, shown as a numbered pin.
class NoteMark extends EditMark {
  NoteMark(this.at, this.text);
  final Offset at;
  final String text;
}

/// A shape the Resize tool crops or extends to; [size] is the AI's size.
class EditRatio {
  const EditRatio(this.id, this.label, this.w, this.h, this.size);
  final String id, label, size;
  final double w, h;
  double get value => w / h;
}

const editRatios = [
  EditRatio('1:1', 'Square 1:1', 1, 1, '1024x1024'),
  EditRatio('2:3', 'Portrait 2:3', 2, 3, '1024x1536'),
  EditRatio('3:2', 'Landscape 3:2', 3, 2, '1536x1024'),
];

class ImageEditException implements Exception {
  ImageEditException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// The largest frame of [ratio] inside a [width] x [height] picture; [shift]
/// (0 to 1) slides it along the free side.
Rect cropFrame(int width, int height, EditRatio ratio, double shift) {
  if (width / height > ratio.value) {
    final w = height * ratio.value;
    return Rect.fromLTWH((width - w) * shift, 0, w, height.toDouble());
  }
  final h = width / ratio.value;
  return Rect.fromLTWH(0, (height - h) * shift, width.toDouble(), h);
}

/// The picture already has the shape of [ratio].
bool sameShape(int width, int height, EditRatio ratio) =>
    (width / height - ratio.value).abs() < 0.01 * ratio.value;

/// A Markup stroke that comes back near where it started circles an area:
/// the AI may change the whole inside.
bool circles(StrokeMark stroke, double width, double height) {
  if (stroke.erase || stroke.points.length < 8) return false;
  var left = double.infinity, top = double.infinity;
  var right = -double.infinity, bottom = -double.infinity;
  for (final p in stroke.points) {
    left = math.min(left, p.dx * width);
    right = math.max(right, p.dx * width);
    top = math.min(top, p.dy * height);
    bottom = math.max(bottom, p.dy * height);
  }
  final across = math.sqrt(
    math.pow(right - left, 2) + math.pow(bottom - top, 2),
  );
  final brush = stroke.size * width;
  final first = stroke.points.first, last = stroke.points.last;
  final gap = math.sqrt(
    math.pow((first.dx - last.dx) * width, 2) +
        math.pow((first.dy - last.dy) * height, 2),
  );
  return across > brush * 3 && gap < math.max(brush * 2, across * 0.25);
}

/// Moves marks onto a new picture of [to] pixels: [map] takes the old
/// picture's pixels to the new one's. Notes that fall outside are dropped.
List<EditMark> moveMarks(
  List<EditMark> marks,
  Size from,
  Size to,
  Offset Function(Offset) map,
) {
  Offset point(Offset p) {
    final moved = map(Offset(p.dx * from.width, p.dy * from.height));
    return Offset(moved.dx / to.width, moved.dy / to.height);
  }

  final moved = <EditMark>[];
  for (final mark in marks) {
    switch (mark) {
      case NoteMark():
        final p = point(mark.at);
        if (p.dx >= 0 && p.dx <= 1 && p.dy >= 0 && p.dy <= 1) {
          moved.add(NoteMark(p, mark.text));
        }
      case StrokeMark():
        moved.add(
          StrokeMark(
            erase: mark.erase,
            size: mark.size * from.width / to.width,
            points: [for (final p in mark.points) point(p)],
          ),
        );
    }
  }
  return moved;
}

/// Removes a plain background from straight (not premultiplied) RGBA
/// pixels: the most common colour round the edge, grown inwards through
/// smooth shading, with soft edges cleaned of the old background colour.
/// [strength] runs from 0 to 100. Answers new straight RGBA pixels, or
/// throws an [ImageEditException] that says why not.
Uint8List removeBackground(
  Uint8List rgba,
  int width,
  int height,
  int strength,
) {
  final d = rgba;
  final edge = <int>[
    for (var x = 0; x < width; x++) ...[x, (height - 1) * width + x],
    for (var y = 1; y < height - 1; y++) ...[y * width, y * width + width - 1],
  ];
  final counts = <int, List<int>>{};
  for (final i in edge) {
    final o = i * 4;
    if (d[o + 3] < 16) continue;
    final key = (d[o] >> 4) << 8 | (d[o + 1] >> 4) << 4 | d[o + 2] >> 4;
    final count = counts.putIfAbsent(key, () => [0, 0, 0, 0]);
    count[0]++;
    count[1] += d[o];
    count[2] += d[o + 1];
    count[3] += d[o + 2];
  }
  if (counts.isEmpty) {
    throw ImageEditException('The background is already see-through.');
  }
  final best = counts.values.reduce((a, b) => b[0] > a[0] ? b : a);
  final r = best[1] / best[0], g = best[2] / best[0], b = best[3] / best[0];
  final limit = 12 + strength * 0.9;
  final near = limit * limit;
  double distance(int o) {
    final dr = d[o] - r, dg = d[o + 1] - g, db = d[o + 2] - b;
    return dr * dr + dg * dg + db * db;
  }

  final plain = edge
      .where((i) => d[i * 4 + 3] < 16 || distance(i * 4) <= near)
      .length;
  if (plain < edge.length * 0.45) {
    throw ImageEditException(
      'The edge of this picture is not one plain colour, so its background '
      'cannot be removed here. Describe it instead, for example “make the '
      'background plain white”.',
    );
  }

  final total = width * height;
  final gone = Uint8List(total);
  final queue = Int32List(total);
  var head = 0, tail = 0;
  for (final i in edge) {
    if (gone[i] == 0 && (d[i * 4 + 3] < 16 || distance(i * 4) <= near)) {
      gone[i] = 1;
      queue[tail++] = i;
    }
  }
  final far = near * 2.6;
  void grow(int j, int o) {
    if (gone[j] == 1) return;
    final p = j * 4;
    final dr = d[p] - d[o], dg = d[p + 1] - d[o + 1], db = d[p + 2] - d[o + 2];
    final along = dr * dr + dg * dg + db * db;
    // Close to the background, or a smooth step of its shading.
    if (d[p + 3] < 16 ||
        distance(p) <= near ||
        (along <= 30 && distance(p) <= far)) {
      gone[j] = 1;
      queue[tail++] = j;
    }
  }

  while (head < tail) {
    final i = queue[head++];
    final x = i % width, o = i * 4;
    if (x > 0) grow(i - 1, o);
    if (x < width - 1) grow(i + 1, o);
    if (i >= width) grow(i - width, o);
    if (i + width < total) grow(i + width, o);
  }
  if (tail < total * 0.02) {
    throw ImageEditException(
      'Nothing to remove: the background is too close to the picture itself. '
      'Try more strength.',
    );
  }
  if (tail > total * 0.98) {
    throw ImageEditException(
      'That would remove almost everything. Try less strength.',
    );
  }

  final out = Uint8List.fromList(d);
  int channel(double value) => value.clamp(0, 255).round();
  for (var i = 0; i < total; i++) {
    final o = i * 4;
    if (gone[i] == 1) {
      out[o + 3] = 0;
      continue;
    }
    final x = i % width;
    final edgePixel =
        (x > 0 && gone[i - 1] == 1) ||
        (x < width - 1 && gone[i + 1] == 1) ||
        (i >= width && gone[i - width] == 1) ||
        (i + width < total && gone[i + width] == 1);
    if (!edgePixel) continue;
    // An edge pixel is part background: keep only its own share and colour.
    final alpha = (math.sqrt(distance(o)) / (limit * 2.5)).clamp(0.35, 1.0);
    out[o] = channel(r + (d[o] - r) / alpha);
    out[o + 1] = channel(g + (d[o + 1] - g) / alpha);
    out[o + 2] = channel(b + (d[o + 2] - b) / alpha);
    out[o + 3] = (d[o + 3] * alpha).round();
  }
  return out;
}
