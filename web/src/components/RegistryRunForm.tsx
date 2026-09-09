import { useEffect, useState } from "react";
import { calculationLabel } from "../lib/labels";
import {
  mergeStaticParameters,
  staticParameterNames,
  sweptParameterNames,
  withSyncedStaticParameters,
} from "../lib/staticParams";
import { getCalculationRegistry, getSystem } from "../api/client";
import { CollapsibleSection } from "./CollapsibleSection";
import { NumberInput } from "./NumberInput";
import type { RegistryCalculation, RegistryParameter, SystemDefinition } from "../types";
import { systemDefaultParameters } from "../types";

interface RegistryRunFormProps {
  calculationTypes: string[];
  systems: string[];
  calculationType: string;
  system: string;
  parameters: Record<string, unknown>;
  disabled: boolean;
  layout?: "default" | "starter" | "panel";
  onCalculationTypeChange: (value: string) => void;
  onSystemChange: (value: string) => void;
  onChange: (parameters: Record<string, unknown>) => void;
  onSubmit: () => void;
  onCancel?: () => void;
}

function fieldLabel(param: RegistryParameter): string {
  if (param.name === "direction") {
    return "Направление продолжения";
  }
  return param.description ?? param.name;
}

const STATIC_PARAMETERS_KEY = "static_parameters";
const STARTING_POINT_KEY = "starting_point";

const SWEEP_PARAMS = new Set([
  "first_param",
  "second_param",
  "first_param_min",
  "first_param_max",
  "second_param_min",
  "second_param_max",
  "steps",
]);

const IC_SCAN_PARAMS = new Set([
  "first_var",
  "second_var",
  "first_var_min",
  "first_var_max",
  "second_var_min",
  "second_var_max",
  "var_steps",
]);

const SOLVER_PARAMS = new Set([
  "num_iter_transient",
  "num_iter_attractor",
  "accuracy",
  "escape_threshold",
  "period_verification_cycles",
  "match_coverage",
]);

const SECTIONED_PARAMS = new Set([
  ...SWEEP_PARAMS,
  ...IC_SCAN_PARAMS,
  ...SOLVER_PARAMS,
  STATIC_PARAMETERS_KEY,
  STARTING_POINT_KEY,
]);

function defaultForParam(param: RegistryParameter, systemInfo: SystemDefinition | null): unknown {
  if (param.default !== undefined) {
    return param.default;
  }
  if (param.options_source === "system.parameters" && systemInfo?.parameters.length) {
    return systemInfo.parameters[0];
  }
  if (param.options_source === "system.variables" && systemInfo?.variables.length) {
    return systemInfo.variables[0];
  }
  if (param.allowed_values?.length) {
    return param.allowed_values[0];
  }
  switch (param.type) {
    case "integer":
      return param.range?.[0] ?? 0;
    case "number":
      return 0;
    case "string":
      return "";
    case "object":
      return {};
    case "array":
      return [];
    default:
      return "";
  }
}

function resolveOptions(
  param: RegistryParameter,
  systemInfo: SystemDefinition | null,
): string[] | null {
  if (param.allowed_values?.length) {
    return param.allowed_values;
  }
  if (param.options_source === "system.parameters" && systemInfo?.parameters.length) {
    return systemInfo.parameters;
  }
  if (param.options_source === "system.variables" && systemInfo?.variables.length) {
    return systemInfo.variables;
  }
  return null;
}

function StaticParametersFields({
  systemInfo,
  system,
  parameters,
  disabled,
  onChange,
}: {
  systemInfo: SystemDefinition;
  system: string;
  parameters: Record<string, unknown>;
  disabled: boolean;
  onChange: (parameters: Record<string, unknown>) => void;
}) {
  const swept = sweptParameterNames(parameters);
  const names = staticParameterNames(systemInfo.parameters, swept);
  const staticParams = (parameters.static_parameters as Record<string, number>) ?? {};
  const defaults = systemDefaultParameters[system] ?? systemDefaultParameters.henon!;

  if (names.length === 0) {
    return (
      <div className="field-section field-wide">
        <p className="muted field-section-hint">All system parameters are swept on the map axes.</p>
      </div>
    );
  }

  return (
    <div className="field-section field-wide">
      <div className="static-params-grid">
        {names.map((name) => (
          <NumberInput
            key={name}
            label={name}
            value={staticParams[name] ?? defaults[name] ?? 0}
            disabled={disabled}
            onChange={(value) =>
              onChange({
                ...parameters,
                static_parameters: {
                  ...staticParams,
                  [name]: value,
                },
              })
            }
          />
        ))}
      </div>
    </div>
  );
}

function StartingPointFields({
  systemInfo,
  parameters,
  disabled,
  onChange,
}: {
  systemInfo: SystemDefinition;
  parameters: Record<string, unknown>;
  disabled: boolean;
  onChange: (parameters: Record<string, unknown>) => void;
}) {
  const variables = systemInfo.variables;
  const point = (parameters.starting_point as number[]) ?? [];

  return (
    <div className="field-section field-wide">
      <div className="static-params-grid">
        {variables.map((varName, index) => (
          <NumberInput
            key={varName}
            label={varName}
            value={point[index] ?? 0.1}
            disabled={disabled}
            onChange={(value) => {
              const next = [...point];
              while (next.length < variables.length) {
                next.push(0.1);
              }
              next[index] = value;
              onChange({ ...parameters, starting_point: next });
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Field({
  param,
  value,
  disabled,
  options,
  onChange,
}: {
  param: RegistryParameter;
  value: unknown;
  disabled: boolean;
  options: string[] | null;
  onChange: (value: unknown) => void;
}) {
  const label = param.name === "reset_after_escape" ? "После убегания возвращаться к заданным НУ" : fieldLabel(param);

  if (param.type === "boolean") {
    return <label className="field"><span>{label}</span><select disabled={disabled} value={value === true ? 'true' : 'false'} onChange={e=>onChange(e.target.value==='true')}><option value="false">Нет — наследовать полученное состояние</option><option value="true">Да — вернуться к заданным НУ</option></select></label>;
  }

  if (param.type === "string" && options?.length) {
    const current = String(value ?? options[0]);
    return (
      <label className="field">
        <span>{label}</span>
        <select
          disabled={disabled}
          value={options.includes(current) ? current : options[0]}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {param.name === "direction" && option === "n" ? "Не продолжать" : option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (param.type === "string") {
    return (
      <label className="field">
        <span>{label}</span>
        <input
          type="text"
          disabled={disabled}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }

  if (param.type === "integer" || param.type === "number") {
    return (
      <NumberInput
        label={label}
        value={value}
        disabled={disabled}
        integer={param.type === "integer"}
        min={param.range?.[0]}
        max={param.range?.[1]}
        onChange={onChange}
      />
    );
  }

  return null;
}

export function RegistryRunForm({
  calculationTypes,
  systems,
  calculationType,
  system,
  parameters,
  disabled,
  onCalculationTypeChange,
  onSystemChange,
  onChange,
  onSubmit,
  onCancel,
  layout = "default",
}: RegistryRunFormProps) {
  const [definition, setDefinition] = useState<RegistryCalculation | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([getCalculationRegistry(calculationType), getSystem(system)])
      .then(([registryData, systemData]) => {
        if (cancelled) {
          return;
        }
        const calc = registryData[calculationType];
        const info = systemData[system];
        setDefinition(calc);
        setSystemInfo(info);

        const merged = { ...parameters };
        let changed = false;
        for (const param of calc.parameters) {
          if (param.name === STATIC_PARAMETERS_KEY || param.name === STARTING_POINT_KEY) {
            continue;
          }
          if (merged[param.name] === undefined) {
            merged[param.name] = defaultForParam(param, info);
            changed = true;
            continue;
          }
          const options = resolveOptions(param, info);
          if (options && !options.includes(String(merged[param.name]))) {
            merged[param.name] = options[0];
            changed = true;
          }
        }

        const synced = withSyncedStaticParameters(merged, info.parameters, system);
        if (JSON.stringify(synced) !== JSON.stringify(parameters)) {
          onChange(synced);
        } else if (changed) {
          onChange(merged);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- merge defaults when calculation/system changes
  }, [calculationType, system]);

  function updateParameters(next: Record<string, unknown>) {
    if (!systemInfo) {
      onChange(next);
      return;
    }
    onChange(withSyncedStaticParameters(next, systemInfo.parameters, system));
  }

  function updateField(name: string, value: unknown) {
    let next = { ...parameters, [name]: value };
    if (name === "first_param" || name === "second_param") {
      const swept = sweptParameterNames(next);
      const current = (next.static_parameters as Record<string, number> | undefined) ?? {};
      next = {
        ...next,
        static_parameters: mergeStaticParameters(
          current,
          systemInfo!.parameters,
          swept,
          system,
        ),
      };
    }
    updateParameters(next);
  }

  if (error) {
    return <pre className="error-box">{error}</pre>;
  }

  if (!definition || !systemInfo) {
    return <p className="muted">Loading parameters…</p>;
  }

  function renderParam(param: RegistryParameter) {
    if (param.name === STATIC_PARAMETERS_KEY) {
      return (
        <StaticParametersFields
          key={param.name}
          systemInfo={systemInfo!}
          system={system}
          parameters={parameters}
          disabled={disabled}
          onChange={updateParameters}
        />
      );
    }
    if (param.name === STARTING_POINT_KEY) {
      return (
        <StartingPointFields
          key={param.name}
          systemInfo={systemInfo!}
          parameters={parameters}
          disabled={disabled}
          onChange={updateParameters}
        />
      );
    }
    return (
      <Field
        key={param.name}
        param={param}
        value={parameters[param.name]}
        disabled={disabled}
        options={resolveOptions(param, systemInfo!)}
        onChange={(value) => updateField(param.name, value)}
      />
    );
  }

  const sweepFields = definition.parameters.filter((p) => SWEEP_PARAMS.has(p.name));
  const icFields = definition.parameters.filter((p) => IC_SCAN_PARAMS.has(p.name));
  const solverFields = definition.parameters.filter((p) => SOLVER_PARAMS.has(p.name));
  const otherFields = definition.parameters.filter((p) => !SECTIONED_PARAMS.has(p.name));
  const staticParam = definition.parameters.find((p) => p.name === STATIC_PARAMETERS_KEY);
  const startingPointParam = definition.parameters.find((p) => p.name === STARTING_POINT_KEY);

  const isStarter = layout === "starter" || layout === "panel";

  return (
    <form
      className={isStarter ? "run-form run-form-starter" : "run-form"}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {!isStarter && <h2>Новый расчёт</h2>}
      <div className={isStarter ? "starter-top-row" : "picker-row"}>
        <label className="field">
          <span>Расчёт</span>
          <select
            disabled={disabled}
            value={calculationType}
            onChange={(e) => onCalculationTypeChange(e.target.value)}
          >
            {calculationTypes.map((name) => (
              <option key={name} value={name}>
                {calculationLabel(name)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Система</span>
          <select
            disabled={disabled}
            value={system}
            onChange={(e) => onSystemChange(e.target.value)}
          >
            {systems.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {isStarter && (
          <div className="starter-form-actions">
            <button type="submit" disabled={disabled}>
              {disabled ? "Считается…" : "Запустить"}
            </button>
            {disabled && onCancel && (
              <button type="button" className="danger" onClick={onCancel}>
                Отмена
              </button>
            )}
          </div>
        )}
      </div>
      {definition.description && !isStarter && (
        <p className="muted form-description">{definition.description}</p>
      )}

      <div className={isStarter ? "starter-sections" : undefined}>
        <CollapsibleSection title="Оси параметров" defaultOpen={!isStarter}>
          <div className="field-grid">{sweepFields.map(renderParam)}</div>
        </CollapsibleSection>

        {staticParam && (
          <CollapsibleSection title="Фиксированные параметры" defaultOpen={false}>
            {renderParam(staticParam)}
          </CollapsibleSection>
        )}

        {icFields.length > 0 && (
          <CollapsibleSection title="Скан IC в ячейке" defaultOpen={false}>
            <div className="field-grid">{icFields.map(renderParam)}</div>
          </CollapsibleSection>
        )}

        {startingPointParam && (
          <CollapsibleSection title="Начальная точка" defaultOpen={false}>
            {renderParam(startingPointParam)}
          </CollapsibleSection>
        )}

        {solverFields.length > 0 && (
          <CollapsibleSection title="Солвер" defaultOpen={false}>
            <div className="field-grid">{solverFields.map(renderParam)}</div>
          </CollapsibleSection>
        )}
      </div>

      {otherFields.length > 0 &&
        (isStarter ? (
          <CollapsibleSection title="Дополнительно" defaultOpen={false}>
            <div className="field-grid">{otherFields.map(renderParam)}</div>
          </CollapsibleSection>
        ) : (
          <div className="field-grid">{otherFields.map(renderParam)}</div>
        ))}

      {!isStarter && (
        <div className="form-actions">
          <button type="submit" disabled={disabled}>
            {disabled ? "Считается…" : "Запустить"}
          </button>
          {disabled && onCancel && (
            <button type="button" className="danger" onClick={onCancel}>
              Отмена
            </button>
          )}
        </div>
      )}
    </form>
  );
}
