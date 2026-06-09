import traceback
from definition_parser import parse_definition

# --- テストケース定義 ---
test_cases = [
    # =========================================
    # 1. 基本的な型推論と演算 (Type Inference)
    # =========================================
    {
        "name": "単純な算術演算 (Number)",
        "expr": "1 + 2",
        "expected_return": "number",
        "expected_inputs": [],
        "should_fail": False
    },
    {
        "name": "Inputを含む算術演算 (Input -> Number)",
        "expr": "Input + 10",
        "expected_return": "number",
        "expected_inputs": ["number"],
        "should_fail": False
    },
    {
        "name": "論理演算 (Input -> Boolean)",
        "expr": "Input and true",
        "expected_return": "boolean",
        "expected_inputs": ["boolean"],
        "should_fail": False
    },
    {
        "name": "比較演算 (Input -> Number)",
        "expr": "Input > 100",
        "expected_return": "boolean",
        "expected_inputs": ["number"],
        "should_fail": False
    },
    {
        "name": "等価演算 (Input -> Boolean推定)",
        "expr": "Input == false",
        "expected_return": "boolean",
        "expected_inputs": ["boolean"], # falseと比較しているのでboolean
        "should_fail": False
    },

    # =========================================
    # 2. 標準関数のバリデーション (Validation)
    # =========================================
    {
        "name": "abs関数 正常系",
        "expr": "abs(Input)",
        "expected_return": "number",
        "expected_inputs": ["number"],
        "should_fail": False
    },
    {
        "name": "abs関数 型不一致エラー (Input or false -> Boolean)",
        "expr": "abs(Input or false)",
        "expected_return": None,
        "expected_inputs": [],
        "should_fail": True, # Booleanをabsには渡せない
        "error_msg": "型エラー" 
    },
    {
        "name": "引数不足",
        "expr": "abs()",
        "expected_return": None,
        "expected_inputs": [],
        "should_fail": True
    },

    # =========================================
    # 3. Switch文の複雑な推論 (Switch Logic)
    # =========================================
    {
        "name": "Switch: 固定値から推論 (Target=Num, Res=String)",
        "expr": "switch(Input, 1, 'A', 2, 'B', 'C')",
        "expected_return": "string",
        "expected_inputs": ["number"], # Caseが1, 2なのでInputはNumber
        "should_fail": False
    },
    {
        "name": "Switch: 論理式Case (Target=Num, Res=Num)",
        "expr": "switch(Input, _ > 10, 100, 0)",
        "expected_return": "number",
        "expected_inputs": ["number"], # _ > 10 より InputはNumber
        "should_fail": False
    },
    {
        "name": "Switch: 全てInput (Default Number適用)",
        "expr": "switch(Input, _ > 1, Input, Input)",
        "expected_return": "number",
        "expected_inputs": ["number", "number", "number"], # Target, Res1, Default
        "should_fail": False
    },
    {
        "name": "Switch: 結果に型ヒントあり (Res=Boolean)",
        "expr": "switch(Input, 1, Input, false)",
        "expected_return": "boolean",
        "expected_inputs": ["number", "boolean"], # Target=Num, Res1=Bool(because default is false)
        "should_fail": False
    },
    {
        "name": "Switch: Caseの型不一致",
        "expr": "switch(Input, 1, 'Res', 'string_case', 'Res', 'Def')",
        "expected_return": None,
        "expected_inputs": [],
        "should_fail": True # Case1はInt, Case2はString -> 不一致
    },

    # =========================================
    # 4. エッジケースと禁止事項 (Edge Cases)
    # =========================================
    {
        "name": "Input単体 (禁止)",
        "expr": "Input",
        "expected_return": None,
        "expected_inputs": [],
        "should_fail": True
    },
    {
        "name": "Resultラッパー (Input単体許容)",
        "expr": "result(Input)",
        "expected_return": "number", # Result経由ならデフォルトNumber
        "expected_inputs": ["number"],
        "should_fail": False
    },
    {
        "name": "属性アクセス",
        "expr": "SENSOR.temp > 20",
        "expected_return": "boolean",
        "expected_inputs": [],
        "should_fail": False
    },
    {
        "name": "属性アクセスとInput",
        "expr": "switch(SENSOR.mode, 'auto', Input, 0)",
        "expected_return": "number",
        "expected_inputs": ["number"], # Resultとして使われるInput
        "should_fail": False
    }
]

# --- テスト実行ロジック ---
def run_tests():
    success_count = 0
    fail_count = 0
    
    print(f"{'TEST NAME':<50} | {'RESULT':<10} | {'DETAIL'}")
    print("-" * 80)

    for case in test_cases:
        name = case["name"]
        expr = case["expr"]
        expect_fail = case["should_fail"]
        
        try:
            # 定義は空で実行（必要に応じてモック定義を入れてください）
            result = parse_definition(expr, cached_definition=[])
            
            if expect_fail:
                print(f"{name:<50} | FAILED     | エラーが期待されましたが成功しました。")
                fail_count += 1
                continue

            # 型チェック
            actual_ret = result["overall_return_type"]
            actual_inputs = result["input_types"]
            
            if actual_ret != case["expected_return"]:
                print(f"{name:<50} | FAILED     | 戻り値不一致 Expect:{case['expected_return']} Actual:{actual_ret}")
                fail_count += 1
                continue
            
            if actual_inputs != case["expected_inputs"]:
                print(f"{name:<50} | FAILED     | Input型不一致 Expect:{case['expected_inputs']} Actual:{actual_inputs}")
                fail_count += 1
                continue

            print(f"{name:<50} | PASSED     | OK")
            success_count += 1

        except ValueError as e:
            if expect_fail:
                # 期待通りのエラーか確認（必要ならメッセージ比較も）
                print(f"{name:<50} | PASSED     | 想定通りのエラー: {str(e)}")
                success_count += 1
            else:
                print(f"{name:<50} | FAILED     | 予期せぬエラー: {str(e)}")
                # traceback.print_exc() # デバッグ時はコメントイン
                fail_count += 1
        except Exception as e:
            print(f"{name:<50} | FAILED     | システムエラー: {str(e)}")
            traceback.print_exc()
            fail_count += 1

    print("-" * 80)
    print(f"Total: {len(test_cases)}, Passed: {success_count}, Failed: {fail_count}")

if __name__ == "__main__":
    run_tests()