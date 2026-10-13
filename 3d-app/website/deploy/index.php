<?php

// Entry point for hosts that serve this folder itself (for example a
// sub-folder on shared hosting) instead of public/. Running Laravel from
// here lets it detect the folder, so links and API routes stay correct.
require __DIR__.'/public/index.php';
