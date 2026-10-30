<?php

namespace App\Services;

use RuntimeException;

/**
 * OpenAI turned the request down because of the model or a parameter it does not take (model not found, an unknown
 * or unsupported parameter), not because of the content: OpenAiDesigner retries once with the known-good model.
 */
class AiModelException extends RuntimeException {}
