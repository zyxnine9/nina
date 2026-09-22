#!/bin/bash
# 用法: ./e2e-action.sh <action> [输出截断长度]
# 通过调试页 onRunAction 触发 action，读取 data.output
PROJ=/Users/yongxu/Desktop/nina
ACT=$1
TRUNC=${2:-400}

wechatide -c ClaudeCode automation_evaluate --project $PROJ \
  --fn-source "function(){ var p = getCurrentPages().slice(-1)[0]; p.setData({output:''}); p.onRunAction({currentTarget:{dataset:{action:'$ACT'}}}); return 1; }" \
  --token zyxtest > /dev/null 2>&1

sleep 4

echo "=== $ACT ==="
wechatide -c ClaudeCode automation_evaluate --project $PROJ \
  --fn-source "function(){ var p = getCurrentPages().slice(-1)[0]; var o = p.data.output || ''; return o.length > $TRUNC ? o.slice(0, $TRUNC) + '...(truncated,len=' + o.length + ')' : o; }" \
  --token zyxtest 2>&1 | grep -A4 '"result"' | head -8
