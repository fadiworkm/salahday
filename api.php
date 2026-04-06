<?php
/**
 * Schedule Data API
 * Reads/writes schedule data to data/schedule-data.json
 *
 * Endpoints (via ?action=):
 *   GET  ?action=data              — full data file
 *   GET  ?action=day&date=YYYY-MM-DD — day data (auto-init from previous day)
 *   POST ?action=day&date=YYYY-MM-DD — save day data
 *   DELETE ?action=day&date=YYYY-MM-DD — delete day data
 *   GET  ?action=presets           — custom presets
 *   POST ?action=presets           — save custom presets
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');

$DATA_DIR  = __DIR__ . '/data';
$DATA_FILE  = $DATA_DIR . '/schedule-data.json';
$FOCUS_FILE  = $DATA_DIR . '/focus-data.json';
$KANBAN_FILE = $DATA_DIR . '/kanban-data.json';

if (!is_dir($DATA_DIR)) {
    mkdir($DATA_DIR, 0755, true);
}

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';
$date   = $_GET['date']   ?? '';

function defaultSettings() {
    return [
        'buffers' => [
            'fajr'    => ['before' => 90, 'after' => 30],
            'sunrise' => ['before' => 0,  'after' => 20],
            'dhuhr'   => ['before' => 15, 'after' => 20],
            'asr'     => ['before' => 15, 'after' => 15],
            'maghrib' => ['before' => 10, 'after' => 20],
            'isha'    => ['before' => 10, 'after' => 20],
        ],
        'bedtimeAfterIsha' => 120,
        'timeFormat'       => '12',
    ];
}

function readData() {
    global $DATA_FILE;
    if (!file_exists($DATA_FILE)) {
        return ['days' => [], 'customPresets' => []];
    }
    $raw  = file_get_contents($DATA_FILE);
    $data = json_decode($raw, true);
    if (!$data) {
        return ['days' => [], 'customPresets' => []];
    }
    // Migrate old format
    if (isset($data['workPlannerData']) && !isset($data['days'])) {
        return migrateOldFormat($data);
    }
    if (!isset($data['days']))          $data['days'] = [];
    if (!isset($data['customPresets'])) $data['customPresets'] = [];
    return $data;
}

function writeData($data) {
    global $DATA_FILE;
    // Ensure days is object (not empty array) for consistent JSON
    if (empty($data['days'])) $data['days'] = new stdClass();
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    file_put_contents($DATA_FILE, $json, LOCK_EX);
}

function migrateOldFormat($old) {
    $migrated = ['days' => [], 'customPresets' => []];
    $settings = $old['scheduleSettings'] ?? defaultSettings();

    foreach (($old['workPlannerData'] ?? []) as $dt => $dayPlan) {
        if (is_array($dayPlan) && isset($dayPlan[0])) {
            $plan = ['activities' => $dayPlan, 'disabledPeriods' => []];
        } else {
            $plan = $dayPlan;
        }
        $migrated['days'][$dt] = [
            'activities'      => $plan['activities']      ?? [],
            'disabledPeriods' => $plan['disabledPeriods'] ?? [],
            'manualBedtime'   => $plan['manualBedtime']   ?? null,
            'settings'        => $settings,
        ];
    }
    writeData($migrated);
    return $migrated;
}

function getBody() {
    return json_decode(file_get_contents('php://input'), true);
}

function readFocus() {
    global $FOCUS_FILE;
    if (!file_exists($FOCUS_FILE)) {
        return ['sessions' => []];
    }
    $raw  = file_get_contents($FOCUS_FILE);
    $data = json_decode($raw, true);
    if (!$data) {
        return ['sessions' => []];
    }
    if (!isset($data['sessions'])) $data['sessions'] = [];
    return $data;
}

function writeFocus($data) {
    global $FOCUS_FILE;
    // Ensure sessions is object (not empty array) for consistent JSON
    if (empty($data['sessions'])) $data['sessions'] = new stdClass();
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    file_put_contents($FOCUS_FILE, $json, LOCK_EX);
}

function readKanban() {
    global $KANBAN_FILE;
    if (!file_exists($KANBAN_FILE)) {
        return ['tasks' => []];
    }
    $raw  = file_get_contents($KANBAN_FILE);
    $data = json_decode($raw, true);
    if (!$data) return ['tasks' => []];
    if (!isset($data['tasks'])) $data['tasks'] = [];
    return $data;
}

function writeKanban($data) {
    global $KANBAN_FILE;
    if (empty($data['tasks'])) $data['tasks'] = new stdClass();
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    file_put_contents($KANBAN_FILE, $json, LOCK_EX);
}

// ─── Routing ───

switch ($action) {

    // Full data
    case 'data':
        echo json_encode(readData(), JSON_UNESCAPED_UNICODE);
        break;

    // Day CRUD
    case 'day':
        if (!$date) {
            http_response_code(400);
            echo json_encode(['error' => 'date required']);
            break;
        }

        if ($method === 'GET') {
            $data = readData();

            if (isset($data['days'][$date])) {
                echo json_encode($data['days'][$date], JSON_UNESCAPED_UNICODE);
                break;
            }

            // Auto-initialize from most recent previous day
            $dates = array_keys($data['days']);
            sort($dates);
            $prevDate = null;
            foreach ($dates as $d) {
                if ($d < $date) $prevDate = $d;
            }

            if ($prevDate && isset($data['days'][$prevDate])) {
                // Copy daily habit activities from previous day
                $prevActivities = $data['days'][$prevDate]['activities'] ?? [];
                $habitActivities = array_values(array_filter($prevActivities, function($a) {
                    return !empty($a['dailyHabit']);
                }));

                $dayData = [
                    'activities'      => $habitActivities,
                    'disabledPeriods' => [],
                    'manualBedtime'   => null,
                    'settings'        => $data['days'][$prevDate]['settings'] ?? defaultSettings(),
                ];
            } else {
                $dayData = [
                    'activities'      => [],
                    'disabledPeriods' => [],
                    'manualBedtime'   => null,
                    'settings'        => defaultSettings(),
                ];
            }

            $data['days'][$date] = $dayData;
            writeData($data);
            echo json_encode($dayData, JSON_UNESCAPED_UNICODE);

        } elseif ($method === 'POST') {
            $data = readData();
            $data['days'][$date] = getBody();
            writeData($data);
            echo json_encode(['ok' => true]);

        } elseif ($method === 'DELETE') {
            $data = readData();
            unset($data['days'][$date]);
            writeData($data);
            echo json_encode(['ok' => true]);
        }
        break;

    // Custom presets
    case 'presets':
        if ($method === 'GET') {
            $data = readData();
            echo json_encode($data['customPresets'] ?? [], JSON_UNESCAPED_UNICODE);
        } elseif ($method === 'POST') {
            $data = readData();
            $data['customPresets'] = getBody();
            writeData($data);
            echo json_encode(['ok' => true]);
        }
        break;

    // Focus session CRUD (per date)
    case 'focus':
        if (!$date) {
            http_response_code(400);
            echo json_encode(['error' => 'date required']);
            break;
        }

        if ($method === 'GET') {
            $data = readFocus();
            $sessions = $data['sessions'][$date] ?? [];
            echo json_encode($sessions, JSON_UNESCAPED_UNICODE);

        } elseif ($method === 'POST') {
            $session = getBody();
            if (!$session || !isset($session['id'])) {
                http_response_code(400);
                echo json_encode(['error' => 'session with id required']);
                break;
            }
            $data = readFocus();
            if (!isset($data['sessions'][$date])) {
                $data['sessions'][$date] = [];
            }
            // Replace existing session with same id, or append
            $found = false;
            foreach ($data['sessions'][$date] as $i => $existing) {
                if ($existing['id'] === $session['id']) {
                    $data['sessions'][$date][$i] = $session;
                    $found = true;
                    break;
                }
            }
            if (!$found) {
                $data['sessions'][$date][] = $session;
            }
            writeFocus($data);
            echo json_encode(['ok' => true]);

        } elseif ($method === 'DELETE') {
            $id = $_GET['id'] ?? '';
            if (!$id) {
                http_response_code(400);
                echo json_encode(['error' => 'id required']);
                break;
            }
            $data = readFocus();
            if (isset($data['sessions'][$date])) {
                $data['sessions'][$date] = array_values(
                    array_filter($data['sessions'][$date], function($s) use ($id) {
                        return $s['id'] !== $id;
                    })
                );
                // Remove date key if no sessions left
                if (empty($data['sessions'][$date])) {
                    unset($data['sessions'][$date]);
                }
            }
            writeFocus($data);
            echo json_encode(['ok' => true]);
        }
        break;

    // All focus data (all dates)
    case 'focus-all':
        $data = readFocus();
        $sessions = $data['sessions'];
        if (empty($sessions)) $sessions = new stdClass();
        echo json_encode($sessions, JSON_UNESCAPED_UNICODE);
        break;

    // Kanban tasks (per date)
    case 'kanban':
        if (!$date) {
            http_response_code(400);
            echo json_encode(['error' => 'date required']);
            break;
        }

        if ($method === 'GET') {
            $data = readKanban();
            $tasks = $data['tasks'][$date] ?? [];
            echo json_encode($tasks, JSON_UNESCAPED_UNICODE);

        } elseif ($method === 'POST') {
            $data = readKanban();
            $data['tasks'][$date] = getBody();
            writeKanban($data);
            echo json_encode(['ok' => true]);
        }
        break;

    default:
        http_response_code(404);
        echo json_encode(['error' => 'unknown action']);
}
