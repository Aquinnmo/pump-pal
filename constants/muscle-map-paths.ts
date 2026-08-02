import type { MuscleId } from '@/constants/muscles';

export type MuscleMapView = 'anterior' | 'posterior';
export type MuscleMapSide = 'left' | 'right' | 'center';

export interface MuscleMapSegment {
  id: string;
  muscle: MuscleId;
  view: MuscleMapView;
  side: MuscleMapSide;
  d: string;
}

export interface NeutralBodySegment {
  id: string;
  view: MuscleMapView;
  d: string;
}

export const MUSCLE_MAP_VIEWBOX = { width: 360, height: 448 } as const;

/**
 * Authored, stylized surface anatomy for Timber's anterior/posterior map.
 * Deep muscles are intentionally surfaced as small illustrative regions; this
 * is training instrumentation, not a medical diagram.
 */
export const MUSCLE_MAP_SEGMENTS: readonly MuscleMapSegment[] = [
  // Anterior torso
  { id: 'ant-upper-traps-left', muscle: 'upper traps', view: 'anterior', side: 'left', d: 'M72 54 L87 61 L82 76 L57 68 Q64 59 72 54Z' },
  { id: 'ant-upper-traps-right', muscle: 'upper traps', view: 'anterior', side: 'right', d: 'M108 54 L93 61 L98 76 L123 68 Q116 59 108 54Z' },
  { id: 'ant-front-delts-left', muscle: 'front delts', view: 'anterior', side: 'left', d: 'M57 68 Q43 69 38 82 L43 101 L58 94 L66 76Z' },
  { id: 'ant-front-delts-right', muscle: 'front delts', view: 'anterior', side: 'right', d: 'M123 68 Q137 69 142 82 L137 101 L122 94 L114 76Z' },
  { id: 'ant-side-delts-left', muscle: 'side delts', view: 'anterior', side: 'left', d: 'M38 82 Q32 88 33 105 L43 112 L47 98 L43 84Z' },
  { id: 'ant-side-delts-right', muscle: 'side delts', view: 'anterior', side: 'right', d: 'M142 82 Q148 88 147 105 L137 112 L133 98 L137 84Z' },
  { id: 'ant-chest-left', muscle: 'chest', view: 'anterior', side: 'left', d: 'M59 76 Q71 70 87 77 L87 119 Q70 124 54 112 L47 98Z' },
  { id: 'ant-chest-right', muscle: 'chest', view: 'anterior', side: 'right', d: 'M121 76 Q109 70 93 77 L93 119 Q110 124 126 112 L133 98Z' },
  { id: 'ant-serratus-left', muscle: 'serratus anterior', view: 'anterior', side: 'left', d: 'M50 111 L62 121 L58 154 L47 145 L44 124Z' },
  { id: 'ant-serratus-right', muscle: 'serratus anterior', view: 'anterior', side: 'right', d: 'M130 111 L118 121 L122 154 L133 145 L136 124Z' },
  { id: 'ant-upper-abs', muscle: 'upper abs', view: 'anterior', side: 'center', d: 'M65 121 Q90 128 115 121 L111 161 Q90 168 69 161Z' },
  { id: 'ant-lower-abs', muscle: 'lower abs', view: 'anterior', side: 'center', d: 'M69 164 Q90 171 111 164 L108 205 L90 217 L72 205Z' },
  { id: 'ant-obliques-left', muscle: 'obliques', view: 'anterior', side: 'left', d: 'M47 148 L66 164 L69 203 L55 217 L43 188Z' },
  { id: 'ant-obliques-right', muscle: 'obliques', view: 'anterior', side: 'right', d: 'M133 148 L114 164 L111 203 L125 217 L137 188Z' },
  { id: 'ant-lats-left', muscle: 'lats', view: 'anterior', side: 'left', d: 'M44 112 L50 113 L45 146 L40 165 L37 139Z' },
  { id: 'ant-lats-right', muscle: 'lats', view: 'anterior', side: 'right', d: 'M136 112 L130 113 L135 146 L140 165 L143 139Z' },

  // Anterior arms
  { id: 'ant-biceps-left', muscle: 'biceps', view: 'anterior', side: 'left', d: 'M34 106 Q43 105 46 114 L43 154 Q38 166 30 155 L27 125Z' },
  { id: 'ant-biceps-right', muscle: 'biceps', view: 'anterior', side: 'right', d: 'M146 106 Q137 105 134 114 L137 154 Q142 166 150 155 L153 125Z' },
  { id: 'ant-triceps-left', muscle: 'triceps', view: 'anterior', side: 'left', d: 'M27 111 L34 106 L30 155 L24 163 L20 134Z' },
  { id: 'ant-triceps-right', muscle: 'triceps', view: 'anterior', side: 'right', d: 'M153 111 L146 106 L150 155 L156 163 L160 134Z' },
  { id: 'ant-forearm-flexors-left', muscle: 'forearm flexors', view: 'anterior', side: 'left', d: 'M24 163 L42 159 L38 207 L29 224 L18 211Z' },
  { id: 'ant-forearm-flexors-right', muscle: 'forearm flexors', view: 'anterior', side: 'right', d: 'M156 163 L138 159 L142 207 L151 224 L162 211Z' },
  { id: 'ant-forearm-extensors-left', muscle: 'forearm extensors', view: 'anterior', side: 'left', d: 'M18 161 L24 163 L18 211 L12 205 L12 177Z' },
  { id: 'ant-forearm-extensors-right', muscle: 'forearm extensors', view: 'anterior', side: 'right', d: 'M162 161 L156 163 L162 211 L168 205 L168 177Z' },

  // Anterior hips and legs
  { id: 'ant-glute-medius-left', muscle: 'glute medius', view: 'anterior', side: 'left', d: 'M55 217 L72 207 L79 228 L66 244 L51 239Z' },
  { id: 'ant-glute-medius-right', muscle: 'glute medius', view: 'anterior', side: 'right', d: 'M125 217 L108 207 L101 228 L114 244 L129 239Z' },
  { id: 'ant-hip-flexors-left', muscle: 'hip flexors', view: 'anterior', side: 'left', d: 'M72 207 L89 218 L84 248 L68 241Z' },
  { id: 'ant-hip-flexors-right', muscle: 'hip flexors', view: 'anterior', side: 'right', d: 'M108 207 L91 218 L96 248 L112 241Z' },
  { id: 'ant-adductors-left', muscle: 'adductors', view: 'anterior', side: 'left', d: 'M84 244 L90 226 L90 335 L80 315 L75 261Z' },
  { id: 'ant-adductors-right', muscle: 'adductors', view: 'anterior', side: 'right', d: 'M96 244 L90 226 L90 335 L100 315 L105 261Z' },
  { id: 'ant-quads-left', muscle: 'quads', view: 'anterior', side: 'left', d: 'M51 242 Q66 239 78 250 L80 315 L70 342 L52 337 L44 298Z' },
  { id: 'ant-quads-right', muscle: 'quads', view: 'anterior', side: 'right', d: 'M129 242 Q114 239 102 250 L100 315 L110 342 L128 337 L136 298Z' },
  { id: 'ant-hamstrings-left', muscle: 'hamstrings', view: 'anterior', side: 'left', d: 'M44 248 L51 242 L52 337 L44 333 L38 294Z' },
  { id: 'ant-hamstrings-right', muscle: 'hamstrings', view: 'anterior', side: 'right', d: 'M136 248 L129 242 L128 337 L136 333 L142 294Z' },
  { id: 'ant-gastrocnemius-left', muscle: 'gastrocnemius', view: 'anterior', side: 'left', d: 'M48 342 L70 346 L69 390 L60 411 L48 391Z' },
  { id: 'ant-gastrocnemius-right', muscle: 'gastrocnemius', view: 'anterior', side: 'right', d: 'M132 342 L110 346 L111 390 L120 411 L132 391Z' },
  { id: 'ant-soleus-left', muscle: 'soleus', view: 'anterior', side: 'left', d: 'M48 390 L60 411 L57 429 L45 426 L42 406Z' },
  { id: 'ant-soleus-right', muscle: 'soleus', view: 'anterior', side: 'right', d: 'M132 390 L120 411 L123 429 L135 426 L138 406Z' },

  // Posterior torso
  { id: 'post-upper-traps-left', muscle: 'upper traps', view: 'posterior', side: 'left', d: 'M252 54 L267 61 L269 91 L239 70 Q245 59 252 54Z' },
  { id: 'post-upper-traps-right', muscle: 'upper traps', view: 'posterior', side: 'right', d: 'M288 54 L273 61 L271 91 L301 70 Q295 59 288 54Z' },
  { id: 'post-rear-delts-left', muscle: 'rear delts', view: 'posterior', side: 'left', d: 'M239 70 Q224 71 218 84 L223 103 L241 94 L249 78Z' },
  { id: 'post-rear-delts-right', muscle: 'rear delts', view: 'posterior', side: 'right', d: 'M301 70 Q316 71 322 84 L317 103 L299 94 L291 78Z' },
  { id: 'post-side-delts-left', muscle: 'side delts', view: 'posterior', side: 'left', d: 'M218 84 Q212 91 213 107 L223 114 L227 99 L223 86Z' },
  { id: 'post-side-delts-right', muscle: 'side delts', view: 'posterior', side: 'right', d: 'M322 84 Q328 91 327 107 L317 114 L313 99 L317 86Z' },
  { id: 'post-rotator-cuff-left', muscle: 'rotator cuff', view: 'posterior', side: 'left', d: 'M241 81 L257 91 L250 110 L234 100Z' },
  { id: 'post-rotator-cuff-right', muscle: 'rotator cuff', view: 'posterior', side: 'right', d: 'M299 81 L283 91 L290 110 L306 100Z' },
  { id: 'post-upper-back-left', muscle: 'upper back', view: 'posterior', side: 'left', d: 'M258 90 L267 95 L267 126 L243 117 L250 108Z' },
  { id: 'post-upper-back-right', muscle: 'upper back', view: 'posterior', side: 'right', d: 'M282 90 L273 95 L273 126 L297 117 L290 108Z' },
  { id: 'post-mid-traps-left', muscle: 'mid traps', view: 'posterior', side: 'left', d: 'M267 91 L270 96 L270 151 L253 126 L258 111Z' },
  { id: 'post-mid-traps-right', muscle: 'mid traps', view: 'posterior', side: 'right', d: 'M273 91 L270 96 L270 151 L287 126 L282 111Z' },
  { id: 'post-lower-traps-left', muscle: 'lower traps', view: 'posterior', side: 'left', d: 'M270 148 L270 190 L253 151 L259 132Z' },
  { id: 'post-lower-traps-right', muscle: 'lower traps', view: 'posterior', side: 'right', d: 'M270 148 L270 190 L287 151 L281 132Z' },
  { id: 'post-lats-left', muscle: 'lats', view: 'posterior', side: 'left', d: 'M242 116 L253 124 L267 190 L248 207 L228 176 L232 129Z' },
  { id: 'post-lats-right', muscle: 'lats', view: 'posterior', side: 'right', d: 'M298 116 L287 124 L273 190 L292 207 L312 176 L308 129Z' },
  { id: 'post-lower-back-left', muscle: 'lower back', view: 'posterior', side: 'left', d: 'M253 158 L268 191 L268 217 L249 210 L243 188Z' },
  { id: 'post-lower-back-right', muscle: 'lower back', view: 'posterior', side: 'right', d: 'M287 158 L272 191 L272 217 L291 210 L297 188Z' },
  { id: 'post-obliques-left', muscle: 'obliques', view: 'posterior', side: 'left', d: 'M228 178 L248 208 L246 226 L231 218 L221 196Z' },
  { id: 'post-obliques-right', muscle: 'obliques', view: 'posterior', side: 'right', d: 'M312 178 L292 208 L294 226 L309 218 L319 196Z' },

  // Posterior arms
  { id: 'post-triceps-left', muscle: 'triceps', view: 'posterior', side: 'left', d: 'M214 108 Q223 106 228 116 L224 159 Q218 170 210 157 L207 127Z' },
  { id: 'post-triceps-right', muscle: 'triceps', view: 'posterior', side: 'right', d: 'M326 108 Q317 106 312 116 L316 159 Q322 170 330 157 L333 127Z' },
  { id: 'post-biceps-left', muscle: 'biceps', view: 'posterior', side: 'left', d: 'M207 113 L214 108 L210 157 L204 164 L200 136Z' },
  { id: 'post-biceps-right', muscle: 'biceps', view: 'posterior', side: 'right', d: 'M333 113 L326 108 L330 157 L336 164 L340 136Z' },
  { id: 'post-forearm-extensors-left', muscle: 'forearm extensors', view: 'posterior', side: 'left', d: 'M204 164 L224 161 L218 208 L209 225 L198 212Z' },
  { id: 'post-forearm-extensors-right', muscle: 'forearm extensors', view: 'posterior', side: 'right', d: 'M336 164 L316 161 L322 208 L331 225 L342 212Z' },
  { id: 'post-forearm-flexors-left', muscle: 'forearm flexors', view: 'posterior', side: 'left', d: 'M198 163 L204 164 L198 212 L192 206 L192 179Z' },
  { id: 'post-forearm-flexors-right', muscle: 'forearm flexors', view: 'posterior', side: 'right', d: 'M342 163 L336 164 L342 212 L348 206 L348 179Z' },

  // Posterior hips and legs
  { id: 'post-glute-medius-left', muscle: 'glute medius', view: 'posterior', side: 'left', d: 'M231 218 L249 210 L269 220 L262 241 L239 245Z' },
  { id: 'post-glute-medius-right', muscle: 'glute medius', view: 'posterior', side: 'right', d: 'M309 218 L291 210 L271 220 L278 241 L301 245Z' },
  { id: 'post-glutes-left', muscle: 'glutes', view: 'posterior', side: 'left', d: 'M239 244 Q253 234 269 241 L269 278 Q251 287 235 272Z' },
  { id: 'post-glutes-right', muscle: 'glutes', view: 'posterior', side: 'right', d: 'M301 244 Q287 234 271 241 L271 278 Q289 287 305 272Z' },
  { id: 'post-adductors-left', muscle: 'adductors', view: 'posterior', side: 'left', d: 'M260 280 L269 281 L269 337 L258 315 L254 292Z' },
  { id: 'post-adductors-right', muscle: 'adductors', view: 'posterior', side: 'right', d: 'M280 280 L271 281 L271 337 L282 315 L286 292Z' },
  { id: 'post-hamstrings-left', muscle: 'hamstrings', view: 'posterior', side: 'left', d: 'M235 278 Q250 284 260 281 L258 323 L249 344 L232 338 L224 300Z' },
  { id: 'post-hamstrings-right', muscle: 'hamstrings', view: 'posterior', side: 'right', d: 'M305 278 Q290 284 280 281 L282 323 L291 344 L308 338 L316 300Z' },
  { id: 'post-quads-left', muscle: 'quads', view: 'posterior', side: 'left', d: 'M224 280 L235 278 L232 338 L224 334 L218 300Z' },
  { id: 'post-quads-right', muscle: 'quads', view: 'posterior', side: 'right', d: 'M316 280 L305 278 L308 338 L316 334 L322 300Z' },
  { id: 'post-gastrocnemius-left', muscle: 'gastrocnemius', view: 'posterior', side: 'left', d: 'M228 342 Q242 337 251 348 L249 391 L240 412 L226 391Z' },
  { id: 'post-gastrocnemius-right', muscle: 'gastrocnemius', view: 'posterior', side: 'right', d: 'M312 342 Q298 337 289 348 L291 391 L300 412 L314 391Z' },
  { id: 'post-soleus-left', muscle: 'soleus', view: 'posterior', side: 'left', d: 'M226 390 L240 412 L237 430 L225 427 L220 406Z' },
  { id: 'post-soleus-right', muscle: 'soleus', view: 'posterior', side: 'right', d: 'M314 390 L300 412 L303 430 L315 427 L320 406Z' },
  { id: 'post-hip-flexors-left', muscle: 'hip flexors', view: 'posterior', side: 'left', d: 'M235 273 L246 276 L241 291 L228 286Z' },
  { id: 'post-hip-flexors-right', muscle: 'hip flexors', view: 'posterior', side: 'right', d: 'M305 273 L294 276 L299 291 L312 286Z' },
] as const;

export const NEUTRAL_BODY_SEGMENTS: readonly NeutralBodySegment[] = [
  { id: 'ant-head', view: 'anterior', d: 'M90 8 Q109 8 112 28 Q111 48 90 54 Q69 48 68 28 Q71 8 90 8Z' },
  { id: 'ant-neck', view: 'anterior', d: 'M78 48 L102 48 L108 63 L90 72 L72 63Z' },
  { id: 'ant-hand-left', view: 'anterior', d: 'M12 205 L29 224 L25 244 L13 241 L7 220Z' },
  { id: 'ant-hand-right', view: 'anterior', d: 'M168 205 L151 224 L155 244 L167 241 L173 220Z' },
  { id: 'ant-foot-left', view: 'anterior', d: 'M45 426 L58 429 L62 440 L38 440Z' },
  { id: 'ant-foot-right', view: 'anterior', d: 'M135 426 L122 429 L118 440 L142 440Z' },
  { id: 'post-head', view: 'posterior', d: 'M270 8 Q289 8 292 28 Q291 48 270 54 Q249 48 248 28 Q251 8 270 8Z' },
  { id: 'post-neck', view: 'posterior', d: 'M258 48 L282 48 L288 63 L270 72 L252 63Z' },
  { id: 'post-hand-left', view: 'posterior', d: 'M192 206 L209 225 L205 244 L193 241 L187 220Z' },
  { id: 'post-hand-right', view: 'posterior', d: 'M348 206 L331 225 L335 244 L347 241 L353 220Z' },
  { id: 'post-foot-left', view: 'posterior', d: 'M225 427 L238 430 L242 440 L218 440Z' },
  { id: 'post-foot-right', view: 'posterior', d: 'M315 427 L302 430 L298 440 L322 440Z' },
] as const;
